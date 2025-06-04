import db from '../db/ChatHistoryDB';

/**
 * Generates test topics with diverse timestamps for development purposes
 * 
 * Creates 100 test topics with messages distributed across various time periods:
 * - 10 from today (including very recent ones in minutes)
 * - 10 from yesterday
 * - 20 from this week (2-7 days ago)
 * - 20 from last week (7-14 days ago)
 * - 20 from this month (14-30 days ago)
 * - 10 from last month (30-60 days ago)
 * - 10 older than 60 days
 * 
 * @param userEmail The email of the user to generate topics for
 * @returns Promise that resolves when generation is complete
 */
export const generateTestTopics = async (userEmail: string): Promise<void> => {
  try {
    // Check if user has any topics
    const topicCount = await db.topics
      .where('userId').equals(userEmail)
      .count();
    
    if (topicCount > 0) {
      console.log(`[DEV] User already has ${topicCount} topics, skipping test data generation`);
      return;
    }
    
    console.log('[DEV] No topics found, generating 100 test topics with diverse timestamps');
    
    // Define time periods for test data
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000; // 1 day in milliseconds
    const hour = 60 * 60 * 1000; // 1 hour in milliseconds
    const minute = 60 * 1000; // 1 minute in milliseconds
    
    // Generate topics with timestamps distributed across different time periods
    for (let i = 1; i <= 100; i++) {
      let timestamp;
      let title = `Test Topic ${i}`;
      let isPinned = false;
      
      // Assign timestamps based on index
      if (i <= 10) { 
        // Today (0-24 hours ago) - including very recent ones
        const hoursAgo = Math.floor(Math.random() * 24);
        
        if (hoursAgo < 1) {
          // Very recent (within last hour)
          const minutesAgo = Math.floor(Math.random() * 59) + 1;
          timestamp = now - (minutesAgo * minute);
          title = `Just now topic - ${minutesAgo} minutes ago`;
        } else {
          timestamp = now - (hoursAgo * hour);
          title = `Today topic - ${hoursAgo} hours ago`;
        }
        
        // Make some topics pinned
        isPinned = i <= 3;
      } 
      else if (i <= 20) { 
        // Yesterday
        const hoursAgo = 24 + Math.floor(Math.random() * 24);
        timestamp = now - (hoursAgo * hour);
        title = `Yesterday topic ${i-10}`;
      } 
      else if (i <= 40) { 
        // This week (2-7 days ago)
        const daysAgo = 2 + Math.floor(Math.random() * 5);
        timestamp = now - (daysAgo * day);
        title = `This week topic ${i-20}`;
        
        // Make some topics pinned
        isPinned = i <= 23;
      } 
      else if (i <= 60) { 
        // Last week (7-14 days ago)
        const daysAgo = 7 + Math.floor(Math.random() * 7);
        timestamp = now - (daysAgo * day);
        title = `Last week topic ${i-40}`;
      } 
      else if (i <= 80) { 
        // This month (14-30 days ago)
        const daysAgo = 14 + Math.floor(Math.random() * 16);
        timestamp = now - (daysAgo * day);
        title = `This month topic ${i-60}`;
      } 
      else if (i <= 90) { 
        // Last month (30-60 days ago)
        const daysAgo = 30 + Math.floor(Math.random() * 30);
        timestamp = now - (daysAgo * day);
        title = `Last month topic ${i-80}`;
      } 
      else { 
        // Older (60+ days ago)
        const daysAgo = 60 + Math.floor(Math.random() * 180); // Up to 8 months old
        timestamp = now - (daysAgo * day);
        title = `Old topic ${i-90}`;
      }
      
      // Create topic
      const topicId = await db.topics.add({
        userId: userEmail,
        title: title,
        createdAt: timestamp,
        lastActive: timestamp,
        messageCnt: 2,
        userMessageCnt: 1,
        assistantMessageCnt: 1,
        personaId: 'traditional-medicine', // Default persona
        pinnedState: isPinned
      });
      
      // Add user message
      await db.messages.add({
        topicId: topicId as number,
        timestamp: timestamp,
        role: 'user',
        content: `This is test message ${i} from user. For testing performance and storage functionality.`
      });
      
      // Add bot response
      await db.messages.add({
        topicId: topicId as number,
        timestamp: timestamp + 5000,
        role: 'assistant',
        content: `This is test response ${i} from assistant. This simulates a response to the user's query about traditional medicine. The response is intentionally kept short for test purposes, but in a real scenario, these messages could be much longer and would benefit from compression.`
      });
      
      // Log progress at intervals
      if (i % 10 === 0) {
        console.log(`[DEV] Generated ${i}/100 test topics`);
      }
    }
    
    console.log('[DEV] Successfully generated 100 test topics with diverse timestamps');
    
    // Refresh topic list if needed
    if (window.triggerTopicListRefresh) {
      window.triggerTopicListRefresh();
    }
  } catch (error) {
    console.error('[DEV] Error generating test topics:', error);
  }
}; 