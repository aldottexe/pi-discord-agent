# BOT

## endpoints
- [ ] continueLastConvo
- [ ] newConvo

## listenters
- [ ] onThinkingComplete
- [ ] onOutputComplete
- [ ] onNeedToolCallApproval

## architecture
keep session open for set ammt of time. if endpoint is called while session is open, enqueue msg. if session closed, make a new one

# DC

## Commands
- [ ] /new
- [ ] /approve
- [ ] /deny

## Reply
- replying to a message will switch to that session

# SCHEDULER
