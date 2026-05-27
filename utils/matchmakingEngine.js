const { EventRegistration, User, BarterWorkspace, Mentorship } = require('../models/CoreSchemas');

const compileMissionBrief = async (eventId, targetUserId) => {
    try {
        const targetReg = await EventRegistration.findOne({ event: eventId, user: targetUserId });
        if (!targetReg) return null;

        const otherRegs = await EventRegistration.find({ event: eventId, user: { $ne: targetUserId } });
        const otherUserIds = otherRegs.map(r => r.user);

        const targetUser = await User.findById(targetUserId);
        const candidates = await User.find({ _id: { $in: otherUserIds }, status: 'Active' })
            .select('name role industry skills portfolio headline activeDirective rating');

        const scoredMatches = await Promise.all(candidates.map(async (candidate) => {
            let score = 40; // Baseline entry score
            let matchReasons = [];

            // 1. Shared/Complementary Industry Domain Match (Weight: 25)
            if (targetUser.industry === candidate.industry) {
                score += 25;
                matchReasons.push(`Both operating inside the ${targetUser.industry || 'Tech'} domain`);
            }

            // 2. Complementary Intent Matching (Weight: 20)
            if (targetReg.attendingPurpose === 'Co-founder' && candidate.role === 'Entrepreneur') {
                score += 20;
                matchReasons.push("Complementary Founder x Entrepreneur synergy detected");
            }

            // 3. Portfolio Quality Evidence (Weight: 15)
            if (candidate.portfolio && candidate.portfolio.length >= 2) {
                score += 15;
                matchReasons.push("Candidate profile presents verified project evidence");
            }

            // 4. Cross-Event Historical Relationship Memory (Moat Integration)
            const mutualWorkspaces = await BarterWorkspace.countDocuments({
                $or: [
                    { initiator: targetUserId, partner: candidate._id },
                    { initiator: candidate._id, partner: targetUserId }
                ]
            });
            if (mutualWorkspaces > 0) {
                score += 15;
                matchReasons.push(`Strong historical alignment: Collaborated in ${mutualWorkspaces} legacy workspace(s)`);
            }

            return {
                user: {
                    id: candidate._id,
                    name: candidate.name,
                    role: candidate.role,
                    skills: candidate.skills,
                    headline: candidate.headline || 'Network Node'
                },
                opportunityScore: Math.min(score, 99),
                matchReasons: matchReasons.length > 0 ? matchReasons : ["Shared network presence parameters"]
            };
        }));

        // Sort and extract top 3 high-signal builders
        const topMatches = scoredMatches
            .sort((a, b) => b.opportunityScore - a.opportunityScore)
            .slice(0, 3);

        const brief = {
            compiledAt: new Date(),
            highValueConnections: topMatches,
            summary: `Algorithmic analysis completed for user path intent context.`
        };

        targetReg.briefData = brief;
        targetReg.missionBriefGenerated = true;
        await targetReg.save();
        return brief;
    } catch (err) {
        console.error('Relationship Intelligence Engine Failure:', err);
        return null;
    }
};

module.exports = { compileMissionBrief };