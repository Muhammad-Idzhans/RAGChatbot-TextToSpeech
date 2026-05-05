from botbuilder.core import ActivityHandler, TurnContext
from botbuilder.schema import Activity, ActivityTypes
from azure.ai.projects import AIProjectClient
from azure.identity import ManagedIdentityCredential
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from config import Config
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote
import traceback
import re

class FoundryBot(ActivityHandler):
    def __init__(self):
        self.credential = ManagedIdentityCredential(
            client_id=Config.AZURE_CLIENT_ID
        )
        self.client = AIProjectClient(
            endpoint=Config.AI_PROJECT_ENDPOINT,
            credential=self.credential
        )
        self.openai_client = self.client.get_openai_client()
        
        # Simple memory to keep the conversation going in the same thread
        self.conversation_id = None

    def _append_sas_tokens(self, text: str) -> str:
        """Find all Azure Blob Storage URLs in text and append a 1-hour SAS token to each."""
        # Match blob URLs anchored to file extensions — this avoids breaking on
        # filenames that contain parentheses like "(Shorten).pptx"
        blob_pattern = r'https://[a-zA-Z0-9]+\.blob\.core\.windows\.net/\S+?\.(?:pptx|ppt|pdf|docx|doc|xlsx|xls|csv|txt|png|jpg|jpeg|gif|mp4|zip|rar)'
        
        urls = re.findall(blob_pattern, text)
        if not urls:
            return text
        
        for blob_url in set(urls):  # deduplicate
            try:
                # Parse the URL components
                from urllib.parse import urlparse
                parsed = urlparse(blob_url)
                account_name = parsed.hostname.split('.')[0]
                path_parts = [p for p in parsed.path.split('/') if p]
                container_name = unquote(path_parts[0])
                blob_name = unquote('/'.join(path_parts[1:]))
                
                # Create a BlobServiceClient with Managed Identity
                blob_service_client = BlobServiceClient(
                    account_url=f"https://{account_name}.blob.core.windows.net",
                    credential=self.credential
                )
                
                # Get User Delegation Key (valid for 1 hour)
                now = datetime.now(timezone.utc)
                starts_on = now - timedelta(minutes=5)
                expires_on = now + timedelta(hours=1)
                
                user_delegation_key = blob_service_client.get_user_delegation_key(
                    key_start_time=starts_on,
                    key_expiry_time=expires_on
                )
                
                # Generate the SAS token
                sas_token = generate_blob_sas(
                    account_name=account_name,
                    container_name=container_name,
                    blob_name=blob_name,
                    user_delegation_key=user_delegation_key,
                    permission=BlobSasPermissions(read=True),
                    start=starts_on,
                    expiry=expires_on,
                    protocol="https"
                )
                
                # Replace the original URL with the signed URL
                signed_url = f"{blob_url}?{sas_token}"
                text = text.replace(blob_url, signed_url)
                
            except Exception as e:
                print(f"Warning: Failed to generate SAS for {blob_url}: {e}", flush=True)
                # Leave the original URL as-is if SAS generation fails
                continue
        
        return text

    async def on_message_activity(self, turn_context: TurnContext):
        # Send typing indicator immediately so the user knows the bot is processing
        typing_activity = Activity(type=ActivityTypes.typing)
        await turn_context.send_activity(typing_activity)
        
        user_message = turn_context.activity.text

        try:
            if not self.conversation_id:
                # Create a new conversation thread
                conv = self.openai_client.conversations.create(
                    items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": user_message}]}]
                )
                self.conversation_id = conv.id
            else:
                # Add message to existing conversation thread
                self.openai_client.conversations.items.create(
                    self.conversation_id,
                    items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": user_message}]}]
                )

            # Let the agent process the conversation
            response = self.openai_client.responses.create(
                conversation=self.conversation_id,
                extra_body={"agent_reference": {"name": Config.AI_AGENT_NAME, "version": Config.AI_AGENT_VERSION, "type": "agent_reference"}}
            )

            if response.output_text:
                # Append SAS tokens to any blob storage URLs in the response
                reply_text = self._append_sas_tokens(response.output_text)
                await turn_context.send_activity(reply_text)
            else:
                await turn_context.send_activity("No response from agent.")

        except Exception as e:
            error_trace = traceback.format_exc()
            await turn_context.send_activity(f"Error: {str(e)}\n{error_trace}")