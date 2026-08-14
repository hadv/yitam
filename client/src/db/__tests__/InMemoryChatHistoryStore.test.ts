import { InMemoryChatHistoryStore } from '../InMemoryChatHistoryStore';
import { describeChatHistoryStoreContract } from './chatHistoryStoreContract';

describeChatHistoryStoreContract('InMemoryChatHistoryStore', async () => new InMemoryChatHistoryStore());
