import { useState, useCallback, useRef, useEffect } from 'react';
import * as ReactDOM from 'react-dom';
import { Message, ChatSocket } from '../types/chat';
import { usePersona } from '../contexts/PersonaContext';
import { AVAILABLE_PERSONAS } from '../components/tailwind/TailwindPersonaSelector';
import db from '../db/ChatHistoryDB';
import { extractTitleFromBotText } from '../utils/titleExtraction';

export const useMessages = (socket: ChatSocket, user: any) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [currentTopicId, setCurrentTopicId] = useState<number | undefined>(undefined);
  
  const pendingMessagesRef = useRef<Message[]>([]);
  const messageUpdaterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);
  const lastMessageRef = useRef<string | null>(null);
  const currentTopicRef = useRef<number | undefined>(undefined);
  const pendingBotMessagesQueue = useRef<{message: Message, topicId: number}[]>([]);
  
  const { 
    currentPersonaId,
    setCurrentPersonaId,
    isPersonaLocked,
    setIsPersonaLocked,
    resetPersona,
    forceSetPersona,
    absoluteForcePersona
  } = usePersona();

  // Update ref when topic ID changes
  useEffect(() => {
    currentTopicRef.current = currentTopicId;
  }, [currentTopicId]);

  // Stable update function that doesn't depend on state
  const updateMessages = useCallback((messages: Message[]) => {
    pendingMessagesRef.current = messages;
    if (!isUpdatingRef.current) {
      isUpdatingRef.current = true;
      if (messageUpdaterTimeoutRef.current) {
        clearTimeout(messageUpdaterTimeoutRef.current);
      }
      messageUpdaterTimeoutRef.current = setTimeout(() => {
        ReactDOM.unstable_batchedUpdates(() => {
          setMessages(pendingMessagesRef.current);
          isUpdatingRef.current = false;
        });
      }, 50);
    }
  }, []);

  // Socket event setup - make sure to clean up all event listeners
  useEffect(() => {
    if (!socket) return;

    // Define event handlers outside to ensure consistency
    const handleBotResponseStart = (response: { id: string }) => {
      const botTimestamp = Date.now() + 100;
      const botId = `bot-${botTimestamp}-${response.id}`;
      const currentMessages = pendingMessagesRef.current;
      
      updateMessages([
        ...currentMessages,
        { 
          id: botId, 
          text: '', 
          isBot: true, 
          isStreaming: true,
          timestamp: botTimestamp 
        }
      ]);
    };

    const handleBotResponseChunk = (response: { text: string, id: string }) => {
      const currentMessages = pendingMessagesRef.current;
      const updatedMessages = currentMessages.map(msg => 
        msg.id.includes(`-${response.id}`)
          ? { ...msg, text: msg.text + response.text }
          : msg
      );
      updateMessages(updatedMessages);
    };

    const handleBotResponseError = (error: { id: string, error: any }) => {
      const currentMessages = pendingMessagesRef.current;
      
      // Find the message that was being streamed
      const updatedMessages = currentMessages.map(msg => {
        if (msg.id.includes(`-${error.id}`)) {
          // Check for credit balance error in the error message
          const isCreditBalanceError = error.error?.error?.message?.toLowerCase().includes('credit balance') ||
                                     error.error?.type?.toLowerCase().includes('credit_balance');
          
          return {
            ...msg,
            isStreaming: false,
            error: {
              type: isCreditBalanceError ? 'credit_balance' as const : 'other' as const,
              message: isCreditBalanceError
                ? 'Số dư tín dụng API Anthropic của bạn quá thấp. Vui lòng truy cập Kế hoạch & Thanh toán để nâng cấp hoặc mua thêm tín dụng.'
                : error.error?.error?.message || 'Xin lỗi, đã xảy ra lỗi khi xử lý phản hồi. Vui lòng thử lại.'
            }
          };
        }
        return msg;
      });
      
      updateMessages(updatedMessages);
    };

    const handleSocketBotResponseEnd = async (response: { id: string, error?: boolean, errorMessage?: string }) => {
      try {
        const currentMessages = pendingMessagesRef.current;
        let botMessage: Message | null = null;
        
        // Find the bot message that was streaming
        for (const msg of currentMessages) {
          if (msg.id.includes(`-${response.id}`)) {
            botMessage = msg;
            break;
          }
        }
        
        if (!botMessage) {
          return;
        }
        
        // Stop streaming
        botMessage.isStreaming = false;
        
        // Update the UI
        const updatedMessages = currentMessages.map(msg => 
          msg.id === botMessage?.id ? { ...botMessage } : msg
        );
        updateMessages(updatedMessages);
        
        // Handle error case
        if (response.error && response.errorMessage) {
          botMessage.error = {
            type: 'other',
            message: response.errorMessage
          };
          return;
        }
        
        // Handle topic creation (add to queue if DB not ready)
        handleBotResponseEnd(botMessage);
      } catch (error) {
        console.error('Error in bot response end handling:', error);
      }
    };

    const handleServerError = (error: any) => {
      let errorObj: Message['error'];
      
      // Try to parse error if it's a JSON string
      if (typeof error === 'string') {
        try {
          const parsedError = JSON.parse(error);
          errorObj = {
            type: parsedError.type as 'rate_limit' | 'credit_balance' | 'other',
            message: parsedError.message
          };
        } catch (e) {
          // If parsing fails, treat as a regular string error
          errorObj = {
            type: 'other' as const,
            message: error
          };
        }
      } else {
        // Handle ServerError object
        errorObj = {
          type: error.type,
          message: error.message
        };
      }

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: '',
        isBot: true,
        error: errorObj
      };
      
      const currentMessages = pendingMessagesRef.current;
      updateMessages([...currentMessages, errorMessage]);
    };

    // Clean up previous listeners first
    socket.off('bot-response-start');
    socket.off('bot-response-chunk');
    socket.off('bot-response-error');
    socket.off('bot-response-end');
    socket.off('error');

    // Register new listeners
    socket.on('bot-response-start', handleBotResponseStart);
    socket.on('bot-response-chunk', handleBotResponseChunk);
    socket.on('bot-response-error', handleBotResponseError);
    socket.on('bot-response-end', handleSocketBotResponseEnd);
    socket.on('error', handleServerError);

    // Clean up on unmount or socket change
    return () => {
      socket.off('bot-response-start', handleBotResponseStart);
      socket.off('bot-response-chunk', handleBotResponseChunk);
      socket.off('bot-response-error', handleBotResponseError);
      socket.off('bot-response-end', handleSocketBotResponseEnd);
      socket.off('error', handleServerError);
    };
  }, [socket, updateMessages]);

  // Handle bot response end and topic creation
  const handleBotResponseEnd = useCallback(async (botMessage: Message) => {
    if (!user) {
      console.log('[TOPIC DEBUG] No user available, skipping topic creation');
      return;
    }
    
    console.log('[TOPIC DEBUG] Starting direct topic creation after bot response');
    
    try {
      // Find the user message that came before this bot response
      const allMessages = pendingMessagesRef.current;
      const messageIndex = allMessages.findIndex(msg => msg.id === botMessage.id);
      const precedingMessages = messageIndex > 0 ? allMessages.slice(0, messageIndex) : [];
      const lastUserMessage = [...precedingMessages].reverse().find(msg => !msg.isBot);
      
      if (!lastUserMessage) {
        console.log('[TOPIC DEBUG] No user message found, skipping topic creation');
        return;
      }
      
      // Get the persona ID to use for the topic
      let personaIdForTopic = currentPersonaId;
      
      // Check if the user message has a stored personaId
      if ((lastUserMessage as any).personaId) {
        const msgPersonaId = (lastUserMessage as any).personaId;
        console.log(`[TOPIC DEBUG] Found persona ID stored in message: ${msgPersonaId}`);
        
        // Verify it's valid
        const isMsgPersonaValid = AVAILABLE_PERSONAS.some(p => p.id === msgPersonaId);
        if (isMsgPersonaValid) {
          console.log(`[TOPIC DEBUG] Using persona from message: ${msgPersonaId}`);
          personaIdForTopic = msgPersonaId;
        } else {
          console.log(`[TOPIC DEBUG] Persona ID in message is invalid: ${msgPersonaId}`);
        }
      }
      
      // Check if we have an existing topic
      if (currentTopicRef.current) {
        try {
          const existingTopic = await db.topics.get(currentTopicRef.current);
          if (existingTopic && existingTopic.personaId) {
            // If topic already exists, use its persona
            personaIdForTopic = existingTopic.personaId;
            console.log(`[TOPIC DEBUG] Using existing topic's persona: ${personaIdForTopic}`);
          }
        } catch (e) {
          console.error('[TOPIC DEBUG] Error checking existing topic:', e);
        }
      }
      
      // Verify the persona ID is valid
      const isValidPersonaId = AVAILABLE_PERSONAS.some(p => p.id === personaIdForTopic);
      if (!isValidPersonaId) {
        console.error(`[TOPIC DEBUG] Invalid persona ID: ${personaIdForTopic}, falling back to yitam`);
        personaIdForTopic = 'yitam';
      }
      
      // CRITICAL: Check if we already have a topic - we should NOT create a new one
      if (currentTopicRef.current) {
        console.log(`[TOPIC DEBUG] Topic already exists (${currentTopicRef.current}), updating with message`);
        
        try {
          // Get the existing topic
          const existingTopic = await db.topics.get(currentTopicRef.current);
          
          if (existingTopic) {
            // CRITICAL: Use the topic's existing persona ID, NOT the current UI persona
            // This ensures we don't override the topic's persona
            const topicPersona = existingTopic.personaId || personaIdForTopic;
            
            console.log(`[TOPIC DEBUG] Existing topic has persona: ${topicPersona}`);
            
            // Update the existing topic with current values
            await db.topics.update(currentTopicRef.current, {
              lastActive: Date.now(),
              messageCnt: (existingTopic.messageCnt || 0) + 1,
              assistantMessageCnt: (existingTopic.assistantMessageCnt || 0) + 1,
              totalTokens: (existingTopic.totalTokens || 0) + Math.ceil(botMessage.text.length / 4)
            });
            
            // Save the bot message to the existing topic
            await db.messages.put({
              id: Date.now(),
              topicId: currentTopicRef.current,
              timestamp: botMessage.timestamp || Date.now(),
              role: 'assistant',
              content: botMessage.text,
              type: 'text',
              tokens: Math.ceil(botMessage.text.length / 4),
              modelVersion: 'claude-3'
            });
            
            console.log(`[TOPIC DEBUG] Added message to existing topic ${currentTopicRef.current}`);
            
            // CRITICAL: Make sure the UI shows the correct persona for this topic
            absoluteForcePersona(topicPersona);
            setIsPersonaLocked(true);
            
            return;
          }
        } catch (error) {
          console.error('[TOPIC DEBUG] Error accessing existing topic:', error);
          // Continue with creating a new topic as fallback
        }
      }
      
      // Extract title from bot message
      const extractedTitle = extractTitleFromBotText(botMessage.text);
      console.log(`[TOPIC DEBUG] Extracted title: "${extractedTitle}"`);
      
      // Use a timestamp for all operations
      const timestamp = Date.now();
      
      // CRITICAL FIX: Final verification to ensure we have a valid persona
      // This is the LAST check before creating the topic
      const finalPersonaId = isValidPersonaId ? personaIdForTopic : 'yitam';
      console.log(`[TOPIC DEBUG] Creating new topic with persona: ${finalPersonaId}`);
      
      // Create topic with PUT instead of ADD
      await db.topics.put({
        id: timestamp,
        userId: user.email,
        title: extractedTitle,
        createdAt: timestamp,
        lastActive: timestamp,
        messageCnt: 2,
        userMessageCnt: 1,
        assistantMessageCnt: 1,
        totalTokens: Math.ceil(lastUserMessage.text.length / 4) + Math.ceil(botMessage.text.length / 4),
        model: 'claude-3',
        systemPrompt: '',
        pinnedState: false,
        personaId: finalPersonaId // CRITICAL: Use the final verified persona ID
      });
      
      const topicId = timestamp;
      console.log(`[TOPIC DEBUG] Successfully created topic with forced ID: ${topicId} and persona: ${finalPersonaId}`);
      
      // CRITICAL: Verify the topic was created with the correct persona
      const createdTopic = await db.topics.get(topicId);
      if (createdTopic) {
        if (createdTopic.personaId !== finalPersonaId) {
          console.error(`[TOPIC DEBUG] PERSONA MISMATCH: Expected ${finalPersonaId}, got ${createdTopic.personaId}`);
          
          // Fix the persona ID if it doesn't match
          await db.topics.update(topicId, { personaId: finalPersonaId });
          console.log(`[TOPIC DEBUG] Forced persona update to: ${finalPersonaId}`);
        } else {
          console.log(`[TOPIC DEBUG] Verified topic ${topicId} created with correct persona: ${createdTopic.personaId}`);
        }
      }
      
      // CRITICAL: Update both state and ref immediately
      ReactDOM.unstable_batchedUpdates(() => {
        setCurrentTopicId(topicId);
        currentTopicRef.current = topicId;
        // Make sure we lock the persona since we now have a topic
        setIsPersonaLocked(true);
        // CRITICAL: Force the persona to be correct
        absoluteForcePersona(finalPersonaId);
      });
      
      // Save user message with put
      await db.messages.put({
        id: timestamp + 1,
        topicId: topicId,
        timestamp: lastUserMessage.timestamp || timestamp - 1000,
        role: 'user',
        content: lastUserMessage.text,
        type: 'text',
        tokens: Math.ceil(lastUserMessage.text.length / 4)
      });
      
      // Save bot message with put
      await db.messages.put({
        id: timestamp + 2,
        topicId: topicId,
        timestamp: botMessage.timestamp || timestamp,
        role: 'assistant',
        content: botMessage.text,
        type: 'text',
        tokens: Math.ceil(botMessage.text.length / 4),
        modelVersion: 'claude-3'
      });
      
      console.log(`[TOPIC DEBUG] Successfully saved both messages to topic ${topicId}`);
    } catch (error) {
      console.error('[TOPIC DEBUG] Error in DIRECT topic creation:', error);
    }
  }, [user, currentPersonaId, absoluteForcePersona, setIsPersonaLocked]);

  // Send message function
  const sendMessage = useCallback((text: string) => {
    if (text.trim() === '') return;
    
    if (!socket) {
      console.error('[SOCKET DEBUG] Cannot send message - socket is not available');
      
      // Show error message to user
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: 'Không thể kết nối đến máy chủ. Vui lòng tải lại trang.',
        isBot: true,
        error: {
          type: 'other',
          message: 'Socket connection unavailable'
        }
      };
      
      updateMessages([...pendingMessagesRef.current, errorMessage]);
      return;
    }
    
    if (!socket.connected) {
      console.error('[SOCKET DEBUG] Socket is not connected. Attempting to reconnect...');
      socket.connect();
      
      // Show connecting message to user
      const connectingMessage: Message = {
        id: `system-${Date.now()}`,
        text: 'Đang kết nối lại với máy chủ...',
        isBot: true
      };
      
      updateMessages([...pendingMessagesRef.current, connectingMessage]);
      
      // Wait for connection and then send
      socket.once('connect', () => {
        console.log('[SOCKET DEBUG] Reconnected successfully, now sending message');
        sendMessage(text);
      });
      
      return;
    }
    
    if (lastMessageRef.current === text) {
      console.log('[SOCKET DEBUG] Duplicate message prevented:', text);
      return;
    }
    
    console.log('[SOCKET DEBUG] Sending message:', text);
    
    lastMessageRef.current = text;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    
    // Capture the current UI-selected persona
    const capturedPersonaId = currentPersonaId;
    console.log(`[PERSONA DEBUG] Captured persona ID at message send time: ${capturedPersonaId}`);
    
    const userMessage: Message = {
      id: `user-${timestamp}-${randomId}`,
      text,
      isBot: false,
      timestamp,
      // Add the persona ID as a non-enumerable property to prevent JSON issues
      personaId: capturedPersonaId
    } as Message & { personaId: string };
    
    // Update UI state
    setHasUserSentMessage(true);
    // Lock the persona using context
    setIsPersonaLocked(true);
    updateMessages([...pendingMessagesRef.current, userMessage]);
    
    // CRITICAL FIX: Check if we're in an existing topic and save the message to the database
    if (currentTopicRef.current) {
      const topicId = currentTopicRef.current;
      
      // Immediately save the user message to the database
      (async () => {
        try {
          // Verify the topic exists and get its details
          const topic = await db.topics.get(topicId);
          
          if (!topic) {
            console.error(`[TOPIC DEBUG] Cannot save message - topic ${topicId} not found`);
            return;
          }
          
          // CRITICAL: Check if the topic has a persona ID
          if (!topic.personaId) {
            // Set the topic's persona to the current UI persona
            console.log(`[PERSONA DEBUG] Topic ${topicId} has no persona ID, setting to current: ${currentPersonaId}`);
            await db.topics.update(topicId, { personaId: currentPersonaId });
          } else if (topic.personaId !== currentPersonaId) {
            // CRITICAL FIX: If the topic's persona differs from the current UI persona,
            // update the UI to match the topic's persona
            console.log(`[PERSONA DEBUG] Topic persona (${topic.personaId}) differs from UI persona (${currentPersonaId}), correcting UI...`);
            absoluteForcePersona(topic.personaId);
          }
          
          // Save the user message
          await db.messages.put({
            id: timestamp,
            topicId: topicId,
            timestamp: timestamp,
            role: 'user',
            content: text,
            type: 'text',
            tokens: Math.ceil(text.length / 4)
          });
          
          // Update topic statistics
          await db.topics.update(topicId, {
            lastActive: timestamp,
            messageCnt: (topic.messageCnt || 0) + 1,
            userMessageCnt: (topic.userMessageCnt || 0) + 1,
            totalTokens: (topic.totalTokens || 0) + Math.ceil(text.length / 4)
          });
          
          console.log(`[TOPIC DEBUG] Saved user message to existing topic ${topicId}`);
        } catch (error) {
          console.error('[TOPIC DEBUG] Error saving user message to database:', error);
        }
      })();
    } else {
      console.log('[TOPIC DEBUG] No existing topic, message will be saved after bot response');
    }
    
    // Find the selected persona for domains
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === capturedPersonaId) || AVAILABLE_PERSONAS[0];
    console.log(`[PERSONA DEBUG] Selected persona: ${selectedPersona.displayName} (${capturedPersonaId})`);
    
    // Send the message to the server with the current persona ID
    socket.emit('chat-message', {
      message: text,
      personaId: capturedPersonaId,
      domains: selectedPersona.domains
    });
    
    console.log(`[PERSONA DEBUG] Message sent with persona: ${capturedPersonaId}`);
  }, [socket, updateMessages, currentPersonaId, setIsPersonaLocked, absoluteForcePersona]);

  // Start a new chat
  const startNewChat = useCallback(() => {
    // Clear current topic
    setCurrentTopicId(undefined);
    currentTopicRef.current = undefined;
    
    // Reset the persona state - this will load the default from localStorage
    resetPersona();
    
    // Find selected persona using the now-reset persona ID
    const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
    
    // Create welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      text: user 
        ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
        : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
      isBot: true,
      timestamp: Date.now()
    };
    
    // Reset message state
    lastMessageRef.current = null;
    pendingMessagesRef.current = [welcomeMessage];
    setMessages([welcomeMessage]);
    setHasUserSentMessage(false);
    
    console.log(`[PERSONA DEBUG] New chat started with default persona: ${currentPersonaId}`);
  }, [currentPersonaId, resetPersona, user]);

  // Handle topic selection
  const handleTopicSelect = useCallback(async (topicId: number) => {
    try {
      // Handle special case when no topics exist (-1)
      if (topicId === -1) {
        console.log('[PERSONA DEBUG] No topics exist, resetting chat to fresh state');
        // Clear current topic
        setCurrentTopicId(undefined);
        currentTopicRef.current = undefined;
        
        // Reset to default persona from localStorage
        resetPersona();
        
        const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
        const welcomeMessage = {
          id: 'welcome',
          text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                    `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
          isBot: true,
          timestamp: Date.now()
        };
        
        updateMessages([welcomeMessage]);
        setHasUserSentMessage(false);
        return;
      }
      
      console.log('[PERSONA DEBUG] Loading topic:', topicId);
      
      try {
        // Get the topic synchronously - CRITICAL: this needs to be loaded first
        const topic = await db.topics.get(topicId);
        
        if (!topic) {
          console.error(`[PERSONA DEBUG] Topic ${topicId} not found`);
          return;
        }
        
        console.log(`[PERSONA DEBUG] Found topic: ${topic.title} (ID: ${topicId})`);
        
        // Verify topic has a persona ID
        if (!topic.personaId) {
          console.warn(`[PERSONA DEBUG] Topic ${topicId} has no persona ID, will assign current UI persona: ${currentPersonaId}`);
          
          // Update the topic with the current persona
          await db.topics.update(topicId, { 
            personaId: currentPersonaId,
            lastActive: Date.now() 
          });
          
          // Re-fetch the topic to ensure we have the updated version
          const updatedTopic = await db.topics.get(topicId);
          if (updatedTopic && updatedTopic.personaId) {
            console.log(`[PERSONA DEBUG] Topic ${topicId} now has persona ID: ${updatedTopic.personaId}`);
            topic.personaId = updatedTopic.personaId;
          }
        } else {
          console.log(`[PERSONA DEBUG] Topic ${topicId} has persona ID: ${topic.personaId}`);
          
          // Just update the last active timestamp
          await db.topics.update(topicId, { lastActive: Date.now() });
        }
        
        // First set the topic ID so it's updated before we do anything else
        setCurrentTopicId(topicId);
        currentTopicRef.current = topicId;
        
        // Get the topic's persona ID
        const topicPersonaId = topic.personaId || currentPersonaId;
        console.log(`[PERSONA DEBUG] Setting persona from topic: ${topicPersonaId}`);
        
        // Use the absoluteForcePersona method which bypasses all restrictions
        // This ensures the UI always shows the correct persona for this topic
        absoluteForcePersona(topicPersonaId);
        
        // Set the lock AFTER setting the persona
        setIsPersonaLocked(true);
        
        // Now load messages for this topic
        const topicMessages = await db.messages
          .where('topicId')
          .equals(topicId)
          .sortBy('timestamp');
        
        console.log(`[PERSONA DEBUG] Loaded ${topicMessages.length} messages for topic ${topicId}`);
        
        // Get the persona to use for display - MUST use the topic's persona ID
        const persona = AVAILABLE_PERSONAS.find(p => p.id === topicPersonaId) || AVAILABLE_PERSONAS[0];
        console.log(`[PERSONA DEBUG] Using persona: ${topicPersonaId}, display name: ${persona.displayName}`);
        
        // Convert DB messages to UI format
        const uiMessages = topicMessages.map(dbMsg => ({
          id: `msg-${dbMsg.id || 'unknown'}-${dbMsg.timestamp}`,
          text: dbMsg.content,
          isBot: dbMsg.role === 'assistant',
          timestamp: dbMsg.timestamp
        }));
        
        // If there are no messages, add a welcome message
        if (uiMessages.length === 0) {
          uiMessages.push({
            id: 'welcome',
            text: user ? `Xin chào ${user.name}! ${persona.displayName} đang lắng nghe!` : 
                        `Xin chào! ${persona.displayName} đang lắng nghe!`,
            isBot: true,
            timestamp: Date.now()
          });
        }
        
        // Update the UI with the messages
        updateMessages(uiMessages);
        
        // Set user sent message to avoid showing sample questions
        setHasUserSentMessage(true);
        
        console.log(`[PERSONA DEBUG] Topic ${topicId} fully loaded with persona "${topicPersonaId}"`);
      } catch (dbError) {
        console.error('[PERSONA DEBUG] Database error:', dbError);
        
        // Show an error message to the user
        const errorMessage = {
          id: `error-${Date.now()}`,
          text: 'Không thể tải cuộc trò chuyện. Vui lòng thử lại.',
          isBot: true,
          error: {
            type: 'other' as const,
            message: 'Failed to load conversation'
          }
        };
        
        updateMessages([errorMessage]);
      }
    } catch (error) {
      console.error('[PERSONA DEBUG] Fatal error in handleTopicSelect:', error);
    }
  }, [user, updateMessages, currentPersonaId, absoluteForcePersona, resetPersona, setIsPersonaLocked]);

  // Create a new topic
  const createNewTopic = useCallback(async (title: string) => {
    if (!user) return;
    
    try {
      console.log(`[TOPIC DEBUG] Creating new topic with persona: ${currentPersonaId}`);
      
      // Create a new topic
      const topicId = await db.topics.add({
        userId: user.email,
        title,
        createdAt: Date.now(),
        lastActive: Date.now(),
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
        model: 'claude-3',
        systemPrompt: '',
        pinnedState: false,
        personaId: currentPersonaId // Ensure we use the current persona
      });
      
      // Set as current topic
      setCurrentTopicId(topicId);
      currentTopicRef.current = topicId;
      
      // Reset message state with welcome message
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeMessage = {
        id: 'welcome',
        text: user ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!` : 
                    `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true
      };
      
      updateMessages([welcomeMessage]);
      
      return topicId;
    } catch (error) {
      console.error('[TOPIC DEBUG] Error creating new topic:', error);
      return undefined;
    }
  }, [user, updateMessages, currentPersonaId]);

  // Initialize welcome message when component mounts
  useEffect(() => {
    if (messages.length === 0 && user) {
      console.log('Initializing welcome message without creating topic...');
      
      // Create welcome message only (no topic creation)
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      const welcomeMessage: Message = {
        id: 'welcome',
        text: `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true,
        timestamp: Date.now()
      };
      
      // Update messages without creating a topic
      lastMessageRef.current = null;
      pendingMessagesRef.current = [welcomeMessage];
      setMessages([welcomeMessage]);
      
      // Reset states
      setHasUserSentMessage(false);
      setIsPersonaLocked(false);
      
      console.log(`[PERSONA DEBUG] Initialized with persona: ${currentPersonaId}, display name: ${selectedPersona.displayName}`);
    }
  }, [messages.length, user, currentPersonaId]);

  // Update welcome message when persona changes
  useEffect(() => {
    // Only update if there's a welcome message and the current message list only has one message
    if (messages.length === 1 && messages[0].id === 'welcome') {
      const selectedPersona = AVAILABLE_PERSONAS.find(p => p.id === currentPersonaId) || AVAILABLE_PERSONAS[0];
      
      const updatedWelcomeMessage: Message = {
        id: 'welcome',
        text: user 
          ? `Xin chào ${user.name}! ${selectedPersona.displayName} đang lắng nghe!`
          : `Xin chào! ${selectedPersona.displayName} đang lắng nghe!`,
        isBot: true,
        timestamp: Date.now()
      };
      
      updateMessages([updatedWelcomeMessage]);
    }
  }, [currentPersonaId, user, messages, updateMessages]);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (messageUpdaterTimeoutRef.current) {
        clearTimeout(messageUpdaterTimeoutRef.current);
      }
    };
  }, []);

  return {
    messages,
    setMessages,
    hasUserSentMessage,
    setHasUserSentMessage,
    currentTopicId,
    setCurrentTopicId,
    sendMessage,
    startNewChat,
    handleTopicSelect,
    createNewTopic,
    updateMessages
  };
}; 