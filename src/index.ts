import { PiChat, sessionChangeListener } from "./pi.js";
import * as messageMap from "./messageSessionMap.js";
import { Client, DMChannel, IntentsBitField, Message, Partials } from 'discord.js';
import { Events } from "discord.js";
import PQueue, { PriorityQueue, QueueAddOptions } from "p-queue";
import * as dotenv from 'dotenv';
import path from "path";
import { fileURLToPath } from "url";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

dotenv.config({ path: path.join(dirName, '../.env') });

const piChat = new PiChat(process.cwd());

const discord = new Client({
   intents: [
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.MessageContent,
      IntentsBitField.Flags.DirectMessages,
   ],
   partials: [Partials.Channel]
});

const messageQueue: PQueue<PriorityQueue, QueueAddOptions> = new PQueue({ concurrency: 1 });
let currentSession: string;

function randomAffirmativeResponse(): string {
   const affirmativeResponses = [
      "on it, boss",
      "mkay",
      "I'll do it, but not because I want to",
      "bow bow bow!!!"
   ]
   return affirmativeResponses[Math.floor(Math.random() * affirmativeResponses.length)];
}

function thinkingResponse(): string {
   const affirmativeResponses = [
      "Uhmmmm...",
      "Uhhhhh...",
      "Pondering...",
      "Thinking..."
   ]
   return affirmativeResponses[Math.floor(Math.random() * affirmativeResponses.length)];
}

function validateReceivedMessage(m: Message): boolean {
   if (m.author.bot) return false;

   if (m.author.id !== process.env.USER_ID) return false;

   const isDM = m.channel instanceof DMChannel;
   if (!isDM) return false;
   return true;
}

async function forwardMessageToUser(message: string, path: string | undefined) {
   messageQueue.add(async () => {
      const m = await user?.send(message)
      if (m?.id && path)
         messageMap.mapMessage(path, m.id);
   });
}

piChat.addPiEventListener((e) => {
   if (e.type === "message_end"
      && e.message.role === "assistant"
   )
      e.message.content.forEach(m => {
         switch (m.type) {
            case "text":
               forwardMessageToUser(m.text, currentSession);
               break;
            case "thinking":
               forwardMessageToUser(`-# 🤔 ${thinkingResponse()}`, currentSession);
         }
      });
});

piChat.addPiEventListener((e) => {
   if (e.type === "tool_execution_start"
   ) {
      forwardMessageToUser(`-# 👾 ${e.toolName} (${JSON.stringify(e.args)})`, currentSession);
   }
});

function onError(e: string) {
   forwardMessageToUser(`-# ⚠️ ${e}`, currentSession);
}
piChat.addOnErrorListener(onError);


const onSessionChange: sessionChangeListener = async ({ name, path }) => {
   if (path)
      currentSession = path;
   forwardMessageToUser(`-# Changed session: ${name ? name : path}`, path)
}
piChat.addOnSessionChangeListener(onSessionChange);

discord.once('clientReady', async () => {

   // new command
   await discord.application?.commands.create({
      name: "new",
      description: "create a new session"
   })

   console.log(`✓ Bot is online as ${discord.user?.tag}`);
});

discord.on(Events.MessageCreate, async (message: Message) => {
   process.stdout.write(`i got a message from: ${message.author.id}\n`);
   if (!validateReceivedMessage(message)) return;
   // message.author.send(message.reference?.messageId ? "thats a reply" : "-# bow bow bow");
   message.react("🧐");
   let text = message.content


   if (message.reference) {
      message.react("↩️");
      const ref = await message.fetchReference()

      if (ref.content) {
         text = `in response to: "${ref.content}"\n${text}`
         process.stdout.write(text)
      }

      if (
         ref.content
         && ref.id
      ) {
         const referencesSession = messageMap.selectSessionFromMessage(ref.id);
         if (referencesSession) {
            process.stdout.write(`Found the session: ${referencesSession}`);
            currentSession = referencesSession;
         } else {
            onError("session not found. creating new.")
            currentSession = await piChat.newSession()
         }
      }
   }

   piChat.queueAction({
      event: "message",
      args: {
         prompt: text,
         sessionPath: currentSession
      }
   });
});


discord.on(Events.InteractionCreate, async (interaction) => {
   if (!interaction.isChatInputCommand()) return;
   if (interaction.commandName === "new")
      messageQueue.add(async () => {
         currentSession = await piChat.newSession()
         interaction.reply(randomAffirmativeResponse())
      });
})

process.stdout.write(process.env.DISCORD_TOKEN?.toString() || "not found");
// Login to the client
void discord.login(process.env.DISCORD_TOKEN);

const user = process.env.USER_ID
   ? await discord.users.fetch(process.env.USER_ID)
   : undefined;

if (!user) {
   process.stderr.write("user not found. is your gv set?")
   process.exit(1);
}
