/**
 * progress.js — 週次與課次推算（網頁與測試共用）
 */
(function () {
  'use strict';

  function taiwanCalendarMidnight(targetDate) {
    const now = targetDate instanceof Date ? targetDate : new Date(targetDate);
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    return new Date(ymd + 'T00:00:00+08:00');
  }

  /**
   * 與進度頁、練習「已教範圍」共用的課次上界（含前導負數課號；開學前自動預估為尚未開教）。
   * 手動選 0／負數時保留 lessonNo <= currentLesson 的原語意。
   */
  function taughtLessonCutoff(currentLesson, isManual) {
    if (currentLesson === 0 && !isManual) return -Infinity;
    return currentLesson;
  }

  function isLessonTaught(lessonNo, currentLesson, isManual) {
    return lessonNo <= taughtLessonCutoff(currentLesson, isManual);
  }

  function isLessonCurrent(lessonNo, currentLesson, isManual) {
    if (currentLesson === 0 && !isManual) return false;
    return lessonNo === currentLesson;
  }

  function classifyLesson(lessonNo, currentLesson, isManual) {
    return {
      isTaught: isLessonTaught(lessonNo, currentLesson, isManual),
      isCurrent: isLessonCurrent(lessonNo, currentLesson, isManual)
    };
  }

  function classifyLessons(lessons, currentLesson, isManual) {
    return (lessons || []).map((l) => {
      const flags = classifyLesson(l.lessonNo, currentLesson, isManual);
      return {
        lessonNo: l.lessonNo,
        title: l.title,
        isTaught: flags.isTaught,
        isCurrent: flags.isCurrent
      };
    });
  }

  /**
   * 練習出題範圍是否納入該課。
   * all-taught 與進度頁共用 taughtCutoff；unfamiliar（錯題／不熟）不另限課次。
   */
  function includeLessonInQuizScope(scope, lessonNo, currentLesson, isManual) {
    if (scope === 'current') return isLessonCurrent(lessonNo, currentLesson, isManual);
    if (scope === 'all-taught') return isLessonTaught(lessonNo, currentLesson, isManual);
    return true;
  }

  function clampCurriculumType(grade, nextType) {
    if (grade !== 2 && (nextType === '110' || nextType === 'demo')) return '115-1';
    return nextType;
  }

  function calculateWeek(semesterStart, targetDate) {
    const start = new Date(semesterStart + 'T00:00:00+08:00');
    const local = taiwanCalendarMidnight(targetDate);
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

  const ZizaiProgress = {
    calculateWeek,
    resolveLessonProgress,
    taughtLessonCutoff,
    isLessonTaught,
    isLessonCurrent,
    classifyLesson,
    classifyLessons,
    includeLessonInQuizScope,
    clampCurriculumType,
    taiwanCalendarMidnight
  };

  if (typeof window !== 'undefined') {
    window.ZizaiProgress = ZizaiProgress;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZizaiProgress;
  }
})();
