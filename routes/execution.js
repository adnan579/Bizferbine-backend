const express = require('express');
const { ExecutionIntent, Workspace, WorkspaceMember, RelationshipEdge, EventOutcome } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

// 1. Dispatch Execution Intent (Replaces traditional "Connect")
router.post('/intent/:targetId', authMiddleware, async (req, res) => {
    try {
        const { intentType, message, eventContext } = req.body;
        const initiator = req.user.userId;
        const target = req.params.targetId;

        if (initiator === target) return res.status(400).json({ message: "Invalid target." });

        const newIntent = new ExecutionIntent({ initiator, target, eventContext, intentType, message });
        await newIntent.save();

        // Update Event Outcome Metrics if applicable
        if (eventContext) {
            await EventOutcome.findOneAndUpdate({ event: eventContext }, { $inc: { connectionsTriggered: 1 } }, { upsert: true });
        }

        res.status(201).json({ message: `Execution Intent [${intentType}] deployed.`, intent: newIntent });
    } catch (error) {
        res.status(500).json({ message: 'System error deploying intent.' });
    }
});

// 2. Workspace Transition Engine (Intent -> Workspace)
router.post('/workspace/compile', authMiddleware, async (req, res) => {
    try {
        const { intentId } = req.body;
        const intent = await ExecutionIntent.findById(intentId);

        if (!intent) return res.status(404).json({ message: "Intent not found." });
        if (intent.status !== 'Accepted') return res.status(400).json({ message: "Intent must be accepted first." });

        // Compile Workspace
        const newWorkspace = new Workspace({ title: `${intent.intentType} Hub`, sourceIntent: intent._id });
        await newWorkspace.save();

        // Add Members
        await WorkspaceMember.insertMany([
            { workspace: newWorkspace._id, user: intent.initiator },
            { workspace: newWorkspace._id, user: intent.target }
        ]);

        // Update Relationship Graph (The Moat)
        await RelationshipEdge.findOneAndUpdate(
            { sourceUser: intent.initiator, targetUser: intent.target, type: 'Collaborated' },
            { $inc: { strength: 1 }, lastInteraction: Date.now() },
            { upsert: true }
        );

        intent.status = 'Converted_To_Workspace';
        await intent.save();

        res.status(201).json({ message: "Workspace successfully compiled.", workspace: newWorkspace });
    } catch (error) {
        res.status(500).json({ message: "Failed to compile workspace." });
    }
});

module.exports = router;