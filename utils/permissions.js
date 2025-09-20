const config = require('../config');

class Permissions {
    async checkPermission(userId, chatId, requireAdmin, sock) {
        try {
            // Check if user is bot admin
            const isBotAdmin = config.isAdmin(userId);
            
            // If command requires admin permission
            if (requireAdmin && !isBotAdmin) {
                return false;
            }
            
            // Check if bot is restricted to admins only
            if (config.get('settings').restrictToAdmins && !isBotAdmin) {
                return false;
            }
            
            // Check if group is in allowed groups list (if specified)
            const allowedGroups = config.get('allowedGroups');
            if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Error checking permissions:', error);
            return false;
        }
    }
    
    async isGroupAdmin(userId, groupId, sock) {
        try {
            if (!groupId.endsWith('@g.us')) {
                return false; // Not a group
            }
            
            const groupMetadata = await sock.groupMetadata(groupId);
            const participant = groupMetadata.participants.find(p => p.id === userId);
            
            return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
        } catch (error) {
            console.error('Error checking group admin status:', error);
            return false;
        }
    }
    
    async isBotAdmin(userId) {
        return config.isAdmin(userId);
    }

    async isBotOwner(userId) {
        return config.isOwner(userId);
    }
    
    async isGroupOwner(userId, groupId, sock) {
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            return groupMetadata.owner === userId;
        } catch (error) {
            console.error('Error checking group owner status:', error);
            return false;
        }
    }
}

module.exports = new Permissions();
