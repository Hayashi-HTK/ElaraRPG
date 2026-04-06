// Gamification Logic
// This file handles XP, Levels, and Achievements
import { db, doc, getDoc, updateDoc, serverTimestamp, setDoc } from './firebase.js';

const XP_TABLE = {
    1: 0,
    2: 500,
    3: 1500,
    4: 3000,
    5: 5000, // Ferro
    10: 15000, // Bronze
    20: 40000, // Prata
    30: 80000, // Ouro
    40: 160000, // Platina
    // Formula: Previous + (Level * 500)
};

const FRAMES = {
    'wood': { name: 'Madeira', level: 1, color: '#8b4513' },
    'iron': { name: 'Ferro', level: 5, color: '#434b4d' },
    'bronze': { name: 'Bronze', level: 10, color: '#cd7f32' },
    'silver': { name: 'Prata', level: 20, color: '#c0c0c0' },
    'gold': { name: 'Ouro', level: 30, color: '#ffd700' },
    'platinum': { name: 'Platina', level: 40, color: '#e5e4e2' }
};

export async function checkAndUnlockFrames(userId, currentLevel, existingUnlocked = ['wood']) {
    if (!userId) return existingUnlocked;
    
    const unlockedFrames = [...existingUnlocked];
    let changed = false;

    if (currentLevel >= 5 && !unlockedFrames.includes('iron')) { unlockedFrames.push('iron'); changed = true; }
    if (currentLevel >= 10 && !unlockedFrames.includes('bronze')) { unlockedFrames.push('bronze'); changed = true; }
    if (currentLevel >= 20 && !unlockedFrames.includes('silver')) { unlockedFrames.push('silver'); changed = true; }
    if (currentLevel >= 30 && !unlockedFrames.includes('gold')) { unlockedFrames.push('gold'); changed = true; }
    if (currentLevel >= 40 && !unlockedFrames.includes('platinum')) { unlockedFrames.push('platinum'); changed = true; }



    if (changed) {
        try {
            const userRef = doc(db, 'profiles', userId);
            await updateDoc(userRef, {
                unlocked_frames: unlockedFrames,
                updated_at: serverTimestamp ? serverTimestamp() : new Date()
            });

            const newlyUnlocked = unlockedFrames.filter(f => !existingUnlocked.includes(f));
            for (const frameId of newlyUnlocked) {
                const frameName = FRAMES[frameId]?.name || frameId;
                await setDoc(doc(db, 'profiles', userId, 'notifications', `frame_unlocked_${frameId}_${currentLevel}`), {
                    type: 'frame_unlocked',
                    title: 'Borda desbloqueada',
                    body: `Você desbloqueou a borda ${frameName}.`,
                    payload: { frameId, frame_name: frameName },
                    read: false,
                    created_at: new Date()
                }, { merge: true });
            }
        } catch (err) {
            console.error("Erro ao atualizar frames desbloqueados:", err);
        }
    }
    return unlockedFrames;
}

export async function addXP(userId, amount, reason) {
    if (!userId) return;

    try {
        const userRef = doc(db, 'profiles', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            let currentXP = data.xp || 0;
            let currentLevel = data.level || 1;
            let newXP = currentXP + amount;
            let newLevel = currentLevel;

            // Check for level up
            // Formula: Next Level * 500 XP needed
            let xpForNext = currentLevel * 500;
            let levelUp = false;

            while (newXP >= xpForNext) {
                newXP -= xpForNext;
                newLevel++;
                xpForNext = newLevel * 500;
                levelUp = true;
            }
            
            if (levelUp) {
                // Unlock frames based on level
                const unlockedFrames = await checkAndUnlockFrames(userId, newLevel, data.unlocked_frames || ['wood']);

                await updateDoc(userRef, {
                    xp: newXP,
                    level: newLevel,
                    unlocked_frames: unlockedFrames,
                    last_xp_source: reason,
                    updated_at: serverTimestamp ? serverTimestamp() : new Date()
                });
                
                if (typeof showNotification === 'function') {
                    showNotification(`LEVEL UP! Você alcançou o nível ${newLevel}!`, 'success');
                } else {
                    alert(`LEVEL UP! Você alcançou o nível ${newLevel}!`);
                }
            } else {
                await updateDoc(userRef, {
                    xp: newXP,
                    last_xp_source: reason,
                    updated_at: serverTimestamp ? serverTimestamp() : new Date()
                });
            }
            
            console.log(`Added ${amount} XP to user ${userId} for ${reason}. New Level: ${newLevel}, XP: ${newXP}`);
        }
    } catch (error) {
        console.error('Error adding XP:', error);
    }
}

export async function checkDailyLogin(userId) {
    if (!userId) return;

    const today = new Date().toDateString();
    const storageKey = `daily_login_${userId}`;
    const lastLogin = localStorage.getItem(storageKey);

    if (lastLogin !== today) {
        await addXP(userId, 100, 'Login Diário');
        localStorage.setItem(storageKey, today);
        showNotification('Login Diário: +100 XP!', 'info');
    }
}

let sessionTimer = null;
const SESSION_INTERVAL = 60000 * 5; // 5 minutes
const XP_PER_INTERVAL = 10;

export function startSessionTracking(userId) {
    if (sessionTimer) clearInterval(sessionTimer);
    
    console.log('Session tracking started for', userId);
    
    sessionTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
            addXP(userId, XP_PER_INTERVAL, 'Tempo de Sessão RPG');
            showNotification(`Sessão RPG: +${XP_PER_INTERVAL} XP`, 'info');
        }
    }, SESSION_INTERVAL);
}

export function stopSessionTracking() {
    if (sessionTimer) clearInterval(sessionTimer);
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `gamification-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export const getLevelProgress = (level, currentXP) => {
    const xpNeeded = level * 500;
    const percentage = Math.min(100, Math.max(0, (currentXP / xpNeeded) * 100));
    return { xpNeeded, percentage };
};
