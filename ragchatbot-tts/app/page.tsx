"use client";

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatbotUI() {

  // 1. STATE VARIABLES: Our app's "memory"
  // Remembers all chat history
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);

  // Remembers what is currently typed in the text box
  const [input, setInput] = useState("");

  // Remembers if we are waiting for Azure to reply
  const [isLoading, setIsLoading] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);

  const messageEndRef = useRef<HTMLDivElement>(null);

  // Track the partially typed message
  const [streamedText, setStreamedText] = useState("");
  // Track if the animation is currently running
  const [isStreaming, setIsStreaming] = useState(false);

  // Speech-to-Text state
  const [isListening, setIsListening] = useState(false);
  const recognizerRef = useRef<any>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]); // <-- Add streamedText here

  // 2. THE ACTION: What happens when we hit "Send"
  const sendMessage = async () => {
    // Prevent sending if empty, loading, or currently typing out a message
    if (!input.trim() || isLoading || isStreaming) return;

    const userMessage = { role: "user", content: input };
    setMessages((prevHistory) => [...prevHistory, userMessage]);

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, conversationId: conversationId }),
      });

      const data = await response.json();

      if (data.reply) {
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        // 1. Turn off the "thinking" dots and turn on the "typing" mode
        setIsLoading(false);
        setIsStreaming(true);

        // 2. Loop through the reply string and reveal it character by character
        let currentText = "";
        const textArray = data.reply.split("");

        for (let i = 0; i < textArray.length; i++) {
          // Adjust this number (15) to make the typing faster or slower!
          await new Promise((resolve) => setTimeout(resolve, 1));
          currentText += textArray[i];
          setStreamedText(currentText);
        }

        // 3. Once fully typed, add it permanently to the message history and reset
        setMessages((prevHistory) => [...prevHistory, { role: "assistant", content: data.reply }]);
        setStreamedText("");
        setIsStreaming(false);

      } else {
        console.error("Agent returned an error:", data.error);
        setIsLoading(false); // Ensure we turn off loading on error
      }
    } catch (error) {
      console.error("Communication failed:", error);
      setIsLoading(false); // Ensure we turn off loading on error
    }
    // Notice we removed the `finally` block! We handle `setIsLoading(false)` manually 
    // now so it doesn't interrupt our streaming state.
  };

  // Clear Chat Function
  const clearChat = () => {
    setMessages([]); // Reset to empty array
    setConversationId(null);
    setStreamedText(""); // Good practice to clear any streaming text too
    setIsStreaming(false);
  };

  const [isMultiLine, setIsMultiLine] = useState(false);
  const MAX_HEIGHT = 200;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const currentScrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${currentScrollHeight}px`;

      // Toggle multi-line state
      if (currentScrollHeight > 60) {
        setIsMultiLine(true);
      } else {
        setIsMultiLine(false);
      }

      // Scrollbar logic
      if (currentScrollHeight >= MAX_HEIGHT) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift + Enter: Let the default behavior happen (creates a new line)
        return;
      } else {
        // Just Enter: Prevent new line and send message
        e.preventDefault();
        if (input.trim()) {
          sendMessage();

          // Optional: Reset the textarea height back to 1 line after sending
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        }
      }
    }
  };

  // Speech to Text - Toggle Start/Stop
  const toggleListening = async () => {
    if (isListening) {
      // STOP listening
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(() => {
          recognizerRef.current.close();
          recognizerRef.current = null;
        });
      }
      setIsListening(false);
      return;
    }

    // START listening
    try {
      const res = await fetch("/api/speech-token");
      const { token, region } = await res.json();

      const sdk = await import("microsoft-cognitiveservices-speech-sdk");
      const authConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);

      // Auto-detect between English and Malay
      const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "ms-MY", "zh-CN"]);

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = sdk.SpeechRecognizer.FromConfig(authConfig, autoDetectConfig, audioConfig);
      recognizerRef.current = recognizer;

      // As the user speaks, append recognized text into the input box
      recognizer.recognized = (_s: any, e: any) => {
        if (e.result.text) {
          setInput((prev) => prev ? prev + " " + e.result.text : e.result.text);
        }
      };

      recognizer.startContinuousRecognitionAsync();
      setIsListening(true);
    } catch (error) {
      console.error("Speech recognition failed:", error);
      setIsListening(false);
    }
  };



  return (
    <div className="d-flex flex-column vh-100 bg-white">

      <header className='d-flex justify-content-center border-bottom '>
        <div className='w-100 p-2 d-flex justify-content-between align-items-center' style={{ maxWidth: '1000px' }}>

          {/* Logo and App Name */}
          <div className='d-flex align-items-center'>
            <i className='bi bi-stars fs-3 me-3 bg-dark text-white d-flex align-items-center justify-content-center p-2 rounded-3'></i>
            <div className=''>
              <h5 className='m-0 p-0 fw-bold'>Zava Chatbot</h5>
              <span className='text-secondary fs-6'>Powered by Microsoft Foundry</span>
            </div>
          </div>

          {/* Clear Button -  Only shows if there are mesages to clear */}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={isLoading || isStreaming}
              className='btn btn-outline-secondary btn-sm d-flex align-items-center border-0 p-2'
            >
              <i className='bi bi-trash me-2'></i>Clear Chat
            </button>
          )}

        </div>
      </header>

      <main className='flex-grow-1 overflow-hidden d-flex justify-content-center p-3 p-md-4'>
        <div className='d-flex flex-column w-100 h-100' style={{ maxWidth: '1000px' }}>

          {/* Chat History Card */}
          <div className='card flex-grow-1 border-0 bg-transparent d-flex flex-column overflow-hidden'>
            <div className='card-body overflow-auto d-flex flex-column p-4 gap-4'>

              {/* Conditionally render the Welcome Screen OR the Chat History */}
              {messages.length === 0 ? (

                /* --- THE BIG TITLE SCREEN --- */
                <div className="h-100 w-100 d-flex flex-column align-items-center justify-content-center text-center pb-5 animate-fade-in-up">
                  <div className="mb-3">
                    <i className="bi bi-stars bg-dark text-white rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px', fontSize: '1.5rem' }}></i>
                  </div>
                  <h1 className="display-5 fw-bold text-dark mb-2">Zava Chatbot</h1>
                  <span className="text-secondary fs-6">Your personal company assistant</span>
                </div>

              ) : (

                /* --- THE EXISTING CHAT INTERFACE --- */
                <>
                  {messages.map((msg, index) => (
                    msg.role === "assistant" ? (

                      /* Dynamic Assistant Message */
                      <div key={index} className="d-flex align-items-start gap-3 w-100">
                        <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px', backgroundColor: '#f3f4f6' }}>
                          <i className="bi bi-stars"></i>
                        </div>
                        <div className="d-flex flex-column align-items-start" style={{ maxWidth: '80%' }}>
                          <div className="chat-bubble p-3 text-dark border-0 text-break" style={{ backgroundColor: '#f3f4f6', borderRadius: '4px 20px 20px 20px' }}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                                ul: ({ node, ...props }) => <ul className="ps-4 mb-1 list-disc" {...props} />,
                                ol: ({ node, ...props }) => <ol className="ps-4 mb-1 list-decimal" {...props} />,
                                li: ({ node, ...props }) => <li className="mb-0" {...props} />
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>

                    ) : (

                      /* Dynamic User Message */
                      <div key={index} className="d-flex justify-content-end w-100">
                        <div className="chat-bubble p-3 text-white border-0 shadow-sm text-break" style={{ backgroundColor: '#3b82f6', borderRadius: '20px 20px 4px 20px', maxWidth: '80%' }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                              ul: ({ node, ...props }) => <ul className="ps-4 mb-1 list-disc" {...props} />,
                              ol: ({ node, ...props }) => <ol className="ps-4 mb-1 list-decimal" {...props} />,
                              li: ({ node, ...props }) => <li className="mb-0" {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>

                    )
                  ))}

                  {/* --- NEW: The Currently Typing Message --- */}
                  {isStreaming && (
                    <div className="d-flex align-items-start gap-3 w-100">
                      <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px', backgroundColor: '#f3f4f6' }}>
                        <i className="bi bi-stars"></i>
                      </div>
                      <div className="d-flex flex-column align-items-start" style={{ maxWidth: '80%' }}>
                        <div className="chat-bubble p-3 text-dark border-0 text-break" style={{ backgroundColor: '#f3f4f6', borderRadius: '4px 20px 20px 20px' }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                              ul: ({ node, ...props }) => <ul className="ps-4 mb-1 list-disc" {...props} />,
                              ol: ({ node, ...props }) => <ol className="ps-4 mb-1 list-decimal" {...props} />,
                              li: ({ node, ...props }) => <li className="mb-0" {...props} />
                            }}
                          >
                            {streamedText}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Typing Indicator */}
                  {isLoading && (
                    <div className="d-flex align-items-start gap-3 w-100">
                      <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '38px', height: '38px', backgroundColor: '#f3f4f6' }}>
                        <i className="bi bi-stars"></i>
                      </div>
                      <div className="d-flex flex-column align-items-start" style={{ maxWidth: '80%' }}>
                        <div className="p-3 text-dark border-0 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#f3f4f6', borderRadius: '4px 20px 20px 20px', height: '44px' }}>
                          <div className="typing-dot" style={{ width: '6px', height: '6px', backgroundColor: '#6b7280', borderRadius: '50%', margin: '0 2px', display: 'inline-block' }}></div>
                          <div className="typing-dot" style={{ width: '6px', height: '6px', backgroundColor: '#6b7280', borderRadius: '50%', margin: '0 2px', display: 'inline-block' }}></div>
                          <div className="typing-dot" style={{ width: '6px', height: '6px', backgroundColor: '#6b7280', borderRadius: '50%', margin: '0 2px', display: 'inline-block' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>

              )}

              <div ref={messageEndRef}></div>
            </div>
          </div>

          {/* Input Area */}
          <div className='d-flex gap-2 mt-4 mb-3'>

            <div className='w-100 position-relative'>

              {/* Multi-line Auto-Expanding Textarea */}
              <textarea
                ref={textareaRef}
                className='form-control border rounded-3 ps-3 pt-3 border-dark'
                style={{
                  paddingBottom: '50px', // Creates a permanent safe zone for the bottom buttons
                  paddingRight: '16px',  // Standard right padding
                  resize: 'none',
                  maxHeight: '200px',
                  overflowY: 'hidden',   // Hidden until JS triggers it
                  minHeight: '100px'     // Forces the box to start tall like your screenshot!
                }}
                placeholder='Type a message...'
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
              />

              {/* Button Container - Pinned permanently to the bottom right */}
              <div className='position-absolute end-0 bottom-0 mb-2 me-3 d-flex align-items-center'>

                {/* Speech to Text Button */}
                <button
                  className={`btn rounded-3 p-2 me-2 border-0 ${isListening ? 'btn-danger' : ''} ${isLoading || isStreaming ? 'border-0' : ''}`}
                  disabled={isLoading || isStreaming}
                  title={isListening ? 'Stop Listening' : 'Use Microphone'}
                  onClick={toggleListening}
                >
                  <i className={`bi ${isListening ? 'bi-mic-mute-fill text-white' : 'bi-mic'} d-flex align-items-center justify-content-center`}></i>
                </button>

                {/* Send Button */}
                <button
                  className='btn btn-secondary rounded-3 p-2'
                  onClick={sendMessage}
                  disabled={isLoading || isStreaming || !input.trim()}
                >
                  {isLoading || isStreaming ? (
                    <span className="spinner-border spinner-border-sm text-white d-flex align-items-center justify-content-center" role="status" aria-hidden="true"></span>
                  ) : (
                    <i className='bi bi-send text-white d-flex align-items-center justify-content-center'></i>
                  )}
                </button>

              </div>
            </div>

          </div>
        </div>

      </main>

    </div>
  );
}