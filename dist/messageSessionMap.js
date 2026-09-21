import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync('./db.sqlite');
process.on("beforeExit", () => db.close());
db.exec(`CREATE TABLE IF NOT EXISTS messageSessionPairs (
      sessionPath TEXT NOT NULL,
      messageID TEXT NOT NULL
   )`);
const mapMessageQuery = db.prepare(`
   INSERT INTO messageSessionPairs (sessionPath, messageID) VALUES (?, ?)
`);
const selectSessionFromMessageQuery = db.prepare(`
   SELECT sessionPath FROM messageSessionPairs WHERE messageID = ? LIMIT 1;
`);
export function selectSessionFromMessage(messageID) {
    return selectSessionFromMessageQuery.get(messageID)?.sessionPath?.toString();
}
export function mapMessage(sessionPath, messageID) {
    process.stdout.write(`mapping ${sessionPath} to ${messageID}`);
    mapMessageQuery.run(sessionPath, messageID);
}
//# sourceMappingURL=messageSessionMap.js.map