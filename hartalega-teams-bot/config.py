import os

class Config:
    PORT = int(os.environ.get("PORT", 3978))
    APP_ID = os.environ.get("MicrosoftAppId", "")
    APP_PASSWORD = os.environ.get("MicrosoftAppPassword", "")
    APP_TYPE = os.environ.get("MicrosoftAppType", "UserAssignedMSI")
    APP_TENANTID = os.environ.get("MicrosoftAppTenantId", "")

    AI_PROJECT_ENDPOINT = os.environ.get("AI_PROJECT_ENDPOINT", "")
    AI_AGENT_NAME = os.environ.get("AI_AGENT_NAME", "hartalega-agent")
    AI_AGENT_VERSION = os.environ.get("AI_AGENT_VERSION", "15")
    AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")