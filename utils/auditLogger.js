const { SystemAuditLog } = require('../models/CoreSchemas');

/**
 * Asynchronously logs a critical system action to the immutable audit log.
 * This is a "fire-and-forget" operation from the perspective of the calling route;
 * it does not block the main request flow and handles its own errors silently.
 *
 * @param {string} actorId - The ID of the user performing the action.
 * @param {string} actionType - A string constant representing the action (e.g., 'USER_SUSPENDED').
 * @param {string} targetId - The ID of the document or entity being affected.
 * @param {string} ip - The IP address of the actor.
 * @param {object} delta - An object capturing the state change, e.g., { before: 'Active', after: 'Suspended' }.
 */
const logAudit = async (actorId, actionType, targetId, ip, delta) => {
    try {
        const auditEntry = new SystemAuditLog({
            actor_id: actorId,
            action_type: actionType,
            target_id: targetId,
            ip_address: ip,
            delta_changes: delta
        });
        await auditEntry.save();
    } catch (error) {
        console.error('CRITICAL: Failed to write to System Audit Log.', {
            actorId, actionType, targetId, error: error.message
        });
    }
};

module.exports = { logAudit };