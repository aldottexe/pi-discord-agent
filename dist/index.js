import { PiChat } from './pi.js';
import * as messageMap from './messageSessionMap.js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDiscordDMSession } from './discord.js';
import { affirmativeResponse, thinkingResponse } from './util/flavorText.js';
if (!process.env.USER_ID)
    throw new Error('USER_ID not found. Is you env set?');
if (!process.env.DISCORD_TOKEN)
    throw new Error('DISCORD_TOKEN not found. Is you env set?');
const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
dotenv.config({ path: path.join(dirName, '../.env') });
const pi = new PiChat(process.cwd());
const dc = await createDiscordDMSession(process.env.USER_ID, process.env.DISCORD_TOKEN);
let currentSession;
pi.addPiEventListener((e) => {
    if (e.type !== 'message_end' || e.message.role !== 'assistant')
        return;
    console.log(e.message.diagnostics);
    e.message.content.forEach((m) => {
        switch (m.type) {
            case 'text':
                dc.forwardMessageToUser(m.text, currentSession).then(({ message, session }) => {
                    if (message?.id)
                        messageMap.mapMessage(session, message.id);
                });
                break;
            case 'thinking':
                dc.forwardMessageToUser(`-# 💭 ${thinkingResponse()}`, currentSession);
                break;
        }
    });
});
pi.addPiEventListener((e) => {
    if (e.type === 'tool_execution_start') {
        dc.forwardMessageToUser(`-# 👾 ${e.toolName} ${JSON.stringify(e.args)}`, currentSession);
    }
});
function onError(e) {
    dc.forwardMessageToUser(`-# ⚠️${e}`, currentSession);
}
pi.addOnErrorListener(onError);
pi.addOnSessionChangeListener(({ name, path }) => {
    if (path)
        currentSession = path;
    dc.forwardMessageToUser(`-# Changed session: ${name ? name : path}`, path);
});
dc.registerCommand({
    name: 'new',
    description: 'new session',
}, async (interaction) => {
    if (interaction.commandName === 'new')
        currentSession = await pi.newSession();
    interaction.reply(affirmativeResponse());
});
dc.addOnMessageListener((m) => {
    if (m.reference)
        return;
    m.react('🧐');
    const prompt = m.content;
    pi.queueAction({
        event: 'message',
        args: {
            prompt: prompt,
            sessionPath: currentSession,
        },
    });
});
dc.addOnMessageListener(async (m) => {
    if (!m.reference)
        return;
    m.react('↩️');
    const ref = await m.fetchReference();
    if (!ref.content)
        return onError('The message you responded to is empty.');
    if (!ref.id)
        return onError("Couldn't fetch message ID");
    const referencedSession = messageMap.selectSessionFromMessage(ref.id);
    if (!referencedSession)
        return onError("The message you refrerenced to isn't tied to a session");
    const prompt = `in response to: "${ref.content}"\n\n${m.content}`;
    pi.queueAction({
        event: 'message',
        args: {
            prompt: prompt,
            sessionPath: referencedSession,
        },
    });
});
//# sourceMappingURL=index.js.map