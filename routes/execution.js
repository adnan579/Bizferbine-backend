const express = require('express');
const { ExecutionIntent, Workspace, WorkspaceMember, RelationshipEdge, EventOutcome, EconomicIndex } = require('../models/CoreSchemas');
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

// --- ROUTE: ACCEPT INTENT & AUTOMATE GRAPH (THE FLYWHEEL) ---
// URL: PUT /api/execution/intent/:intentId/accept
router.put('/intent/:intentId/accept', authMiddleware, async (req, res) => {
    try {
        const intent = await ExecutionIntent.findById(req.params.intentId);
        if (!intent) return res.status(404).json({ message: 'Intent vector not found.' });

        // Ensure only the target can accept
        if (intent.target.toString() !== req.user.userId) return res.status(403).json({ message: 'Unauthorized.' });
        if (intent.status !== 'Proposed') return res.status(400).json({ message: 'Intent already processed.' });

        // 1. Update Intent Status
        intent.status = 'Converted_To_Workspace';
        await intent.save();

        // 2. Auto-Compile Workspace
        const newWorkspace = new Workspace({
            title: `${intent.intentType} Hub`,
            sourceIntent: intent._id
        });
        await newWorkspace.save();

        // Add Members
        await WorkspaceMember.insertMany([
            { workspace: newWorkspace._id, user: intent.initiator, role: 'Initiator' },
            { workspace: newWorkspace._id, user: intent.target, role: 'Partner' }
        ]);

        // 3. GROW THE RELATIONSHIP GRAPH (The Moat)
        await RelationshipEdge.findOneAndUpdate(
            { sourceUser: intent.initiator, targetUser: intent.target },
            {
                $set: { type: 'Collaborated', lastInteraction: Date.now() },
                $inc: { strength: 1 }
            },
            { upsert: true, new: true }
        );

        // 4. LOG ECONOMIC INDEX
        if (intent.eventContext) {
            const newIndexLog = new EconomicIndex({
                metricType: 'Projects Started',
                value: 1,
                eventSource: intent.eventContext,
                participants: [intent.initiator, intent.target]
            });
            await newIndexLog.save();
        }

        res.status(200).json({ message: 'Intent accepted. Workspace, Graph, and Economic Index compiled.', workspace: newWorkspace });
    } catch (error) {
        console.error('Flywheel Automation Error:', error);
        res.status(500).json({ message: 'System failure during execution automation.' });
    }
});

module.exports = router;