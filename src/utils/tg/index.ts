import * as tdl from 'tdl';
import { WebSocket } from 'ws';
import { messageTypes } from '../../types/messages';

let client: tdl.Client;

type TGMessageUpdate = {
    _: string,
    chat_id: string,
    last_message: {
        _: string,
        id: string,
        sender_id: {
            _: string,
            chat_id: string,
        },
        chat_id: string,
        content: {
            _: string,
            text: {
                _: string,
                text: string,
                entities: any[],
            },
            link_preview?: {
                _: string,
                url: string,
                display_url: string,
                site_name: string,
                title: string,
                description: {
                    _: string,
                    text: string,
                    entities: any[],
                }
            }
        },
    },
};

const { TG_CHAT_MESSAGE } = messageTypes;

const formatMessageFromUpdate = async (update: TGMessageUpdate) => {
    if (!update?.chat_id || !update?.last_message?.chat_id) {
        return null;
    }

    const tgClient = await getClient();

    console.log('chat_id:', update?.chat_id);
    // console.log('last_message:', update?.last_message?.chat_id);

    let chat = {
        title: 'Unknown',
        type: 'Unknown',
        photo: null,
    }
    try {
        chat = await tgClient.invoke({
            _: 'getChat',
            chat_id: update?.chat_id,
        }).catch(() => null);
    } catch (error) {
        console.error('!! getChat error:', error);
        return null;
    }

    let sender;

    // if (update.last_message.sender_id?.chat_id) {
    //     sender = await tgClient.invoke({
    //         _: 'getChatMember',
    //         chat_id: update.last_message.chat_id,
    //         member_id: update.last_message.sender_id,
    //     }).catch(() => null);
    // }

    return {
        timestamp: Date.now(),
        sender: sender,
        chat: {
            title: chat?.title,
            type: chat?.type,
            photo: chat?.photo,
        },
        senderId: update?.last_message?.sender_id?.chat_id,
        chatId: update?.chat_id,
        lastMessageChatId: update?.last_message?.chat_id,
        messageId: update?.last_message?.id,
        senderIdObj: update?.last_message?.sender_id,
        text: update?.last_message?.content?.text?.text,
    }
}

export async function createTgClient(ws?: WebSocket) {
    if (client) {
        return client;
    }

    if (!process.env.TG_API_ID || !process.env.TG_API_HASH) {
        throw new Error('TG_API_ID and TG_API_HASH must be set in .env');
    }

    console.log('Creating client...');
    console.log('API ID:', process.env.TG_API_ID);
    console.log('API HASH:', process.env.TG_API_HASH);

    tdl.configure({ tdjson: require('prebuilt-tdlib').getTdjson() });

    client = tdl.createClient({
        apiId: parseInt(process.env.TG_API_ID),
        apiHash: process.env.TG_API_HASH,
    });

    client.on('error', console.error);

    client.on('update', async (update) => {
        if (update._ === 'updateChatLastMessage') {

            const message = await formatMessageFromUpdate(update);

            if (message) {
                if (ws) {
                    ws.send(JSON.stringify({
                        type: TG_CHAT_MESSAGE,
                        payload: message,
                    }));
                } else {
                    console.log('!!! No ws connection !!!');
                }

                console.log('** CHAT MESSAGE **', message);
            } else {
                throw new Error('Error parsing message');
            }
        } else {
            // console.log('** UPDATE **', update);
        }
    });

    await client.login();

    const me = await client.invoke({ _: 'getMe' });
    console.log('My user:', me);

    return client;
}

export async function getClient() {
    if (!client) {
        await createTgClient();
    }

    return client;
}