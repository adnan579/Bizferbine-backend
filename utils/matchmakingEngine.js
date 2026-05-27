const { EventRegistration, User } = require('../models/CoreSchemas');

const compileMissionBrief = async (eventId, targetUserId) => {
    try {
        const targetReg = await EventRegistration.findOne({ event: eventId, user: targetUserId });
        if (!targetReg) return null;

        const otherRegs = await EventRegistration.find({ event: eventId, user: { $ne: targetUserId } });
        const otherUserIds = otherRegs.map(r => r.user);

        const candidates = await User.find({ _id: { $in: otherUserIds }, status: 'Active' })
            .select('name role industry skills portfolio headline')
            .limit(20);

        const scoredMatches = candidates.map(candidate => {
            let score = 50; // Base score
            if (candidate.industry && new RegExp(targetReg.attendingPurpose, 'i').test(candidate.headline)) score += 20;
            if (candidate.portfolio && candidate.portfolio.length >= 2) score += 15;
            return {
                user: { id: candidate._id, name: candidate.name, role: candidate.role, skills: candidate.skills, headline: candidate.headline },
                opportunityScore: Math.min(score, 99)
            };
        });

        const topMatches = scoredMatches.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 3);

        const brief = {
            compiledAt: new Date(),
            highValueConnections: topMatches,
            summary: `Target clusters isolated for your intent parameters: [${targetReg.attendingPurpose}]`
        };

        targetReg.briefData = brief;
        targetReg.missionBriefGenerated = true;
        await targetReg.save();
        return brief;
    } catch (err) {
        console.error('Matchmaker execution failure:', err);
        return null;
    }
};

module.exports = { compileMissionBrief };