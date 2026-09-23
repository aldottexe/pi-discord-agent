import { Client, DMChannel, Events, IntentsBitField, Partials, } from 'discord.js';
import PQueue from 'p-queue';
class DiscordChat {
    #messageQueue = new PQueue({ concurrency: 1 });
    #user;
    #discord;
    #commandCallbacks = {};
    #messageCallbacks = [];
    constructor(client, user) {
        this.#user = user;
        this.#discord = client;
        // register command listener
        this.#discord.on(Events.InteractionCreate, async (i) => {
            if (i.isChatInputCommand() && i.commandName in this.#commandCallbacks)
                this.#commandCallbacks[i.commandName](i);
        });
        // register message listener
        this.#discord.on(Events.MessageCreate, (m) => {
            if (!this.#validateReceivedMessage(m))
                return;
            this.#messageCallbacks.forEach((cb) => cb(m));
        });
    }
    #validateReceivedMessage(m) {
        if (m.author.bot)
            return false;
        if (m.author.id !== process.env.USER_ID)
            return false;
        const isDM = m.channel instanceof DMChannel;
        if (!isDM)
            return false;
        return true;
    }
    async forwardMessageToUser(message, currentSession) {
        return {
            message: await this.#messageQueue.add(async () => this.#user.send(message)),
            session: currentSession,
        };
    }
    async registerCommand(commandInfo, command) {
        if (commandInfo.name.length < 1)
            throw new Error('Cannot register command of name length 0');
        if (commandInfo.name in Object.keys(this.#commandCallbacks))
            throw new Error(`Cannot re-register command of name ${commandInfo.name}`);
        this.#discord.application?.commands.create(commandInfo);
        this.#commandCallbacks[commandInfo.name] = command;
    }
    addOnMessageListener(onMessage) {
        this.#messageCallbacks.push(onMessage);
    }
}
export async function createDiscordDMSession(userID, discordToken) {
    const discord = new Client({
        intents: [
            IntentsBitField.Flags.Guilds,
            IntentsBitField.Flags.GuildMessages,
            IntentsBitField.Flags.MessageContent,
            IntentsBitField.Flags.DirectMessages,
        ],
        partials: [Partials.Channel],
    });
    await discord.login(discordToken);
    await new Promise((res) => discord.on('clientReady', res));
    console.log(`✓ Bot is online as ${discord.user?.tag}`);
    const user = await discord.users.fetch(userID);
    console.log(`> Binding to dm: ${user.tag}`);
    return new DiscordChat(discord, user);
}
//# sourceMappingURL=discord.js.map