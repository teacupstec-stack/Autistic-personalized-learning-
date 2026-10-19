import { describe, it, expect } from 'vitest';
import {
  ACTIVITIES,
  getAllActivities,
  getActivityById,
  filterActivities,
  getRandomActivityForVariant,
  getVisualItemInfo
} from '../services/activityService';

describe('ActivityService & Content Bank', () => {
  it('loads all 12 teacher-certified counting activities', () => {
    const all = getAllActivities();
    expect(all.length).toBe(12);
    expect(all.every(a => a.teacher_approved)).toBe(true);
  });

  it('filters activities accurately by difficulty and presentation', () => {
    const easyVisual = filterActivities('', 'easy', 'visual');
    expect(easyVisual.length).toBeGreaterThan(0);
    expect(easyVisual.every(a => a.difficulty === 'easy' && a.presentation === 'visual')).toBe(true);

    const mediumText = filterActivities('', 'medium', 'text');
    expect(mediumText.length).toBeGreaterThan(0);
    expect(mediumText.every(a => a.difficulty === 'medium' && a.presentation === 'text')).toBe(true);
  });

  it('searches activities by title, description, or keyword', () => {
    const apples = filterActivities('apples');
    expect(apples.length).toBeGreaterThan(0);
    expect(apples[0].title.toLowerCase()).toContain('apple');

    const stars = filterActivities('stars');
    expect(stars.length).toBeGreaterThan(0);
    expect(stars[0].title.toLowerCase()).toContain('star');
  });

  it('retrieves visual item info with correct icon for apples, stars, fish, balloons', () => {
    const appleAct = ACTIVITIES.find(a => a.title.toLowerCase().includes('apple'))!;
    const starAct = ACTIVITIES.find(a => a.title.toLowerCase().includes('star'))!;
    const fishAct = ACTIVITIES.find(a => a.title.toLowerCase().includes('fish'))!;
    const balloonAct = ACTIVITIES.find(a => a.title.toLowerCase().includes('balloon'))!;

    expect(getVisualItemInfo(appleAct).icon).toBe('🍎');
    expect(getVisualItemInfo(starAct).icon).toBe('⭐');
    expect(getVisualItemInfo(fishAct).icon).toBe('🐟');
    expect(getVisualItemInfo(balloonAct).icon).toBe('🎈');
  });
});
