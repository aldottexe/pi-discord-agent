function randomIndex<T>(arr: Array<T>): T {
    return arr[Math.floor(Math.random() * arguments.length)]
}

export function affirmativeResponse(): string {
   const affirmativeResponses = [
      "On it, Boss",
      "Mkay",
      "I'll do it, but not because I want to",
      "bow bow bow!!!"
   ]
   return randomIndex(affirmativeResponses);
}

export function thinkingResponse(): string {
   const thinkingResponses = [
      "Uhmmmm...",
      "Uhhhhh...",
      "Pondering...",
      "Thinking..."
   ];
   return randomIndex(thinkingResponses);
}
