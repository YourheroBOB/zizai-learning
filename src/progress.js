/**
 * progress.js — 週次與課次推算（網頁與測試共用）
 */
(function () {
  'use strict';

  function calculateWeek(semesterStart, targetDate) {
    const start = new Date(semesterStart + 'T00:00:00+08:00');
    const now = targetDate instanceof Date ? targetDate : new Date(targetDate);
    const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msDiff = local.getTime() - start.getTime();
    if (msDiff < 0) return { week: 0, state: 'before-start' };
    const week = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;
    if (week > 20) return { week: 21, state: 'after-end' };
    return { week, state: 'in-semester' };
  }

  /**
   * @param {{ week: number, state: string }} weekInfo
   * @param {number|null|undefined} manualLesson
   * @param {number} totalLessons max positive lesson number
   */
  function resolveLessonProgress(weekInfo, manualLesson, totalLessons) {
    const total = totalLessons || 1;
    if (manualLesson !== null && manualLesson !== undefined) {
      const clamped =
        manualLesson < 0 ? manualLesson : Math.max(0, Math.min(total, manualLesson));
      return {
        currentLesson: clamped,
        isManual: true,
        completedLessons: manualLesson < 0 ? 0 : Math.max(0, clamped - 1)
      };
    }
    if (weekInfo.state === 'before-start') {
      return { currentLesson: 0, isManual: false, completedLessons: 0 };
    }
    const estimated = Math.max(1, Math.min(total, Math.round(weekInfo.week / 1.5) || 1));
    return {
      currentLesson: estimated,
      isManual: false,
      completedLessons: Math.max(0, estimated - 1)
    };
  }

  const ZizaiProgress = { calculateWeek, resolveLessonProgress };

  if (typeof window !== 'undefined') {
    window.ZizaiProgress = ZizaiProgress;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZizaiProgress;
  }
})();
