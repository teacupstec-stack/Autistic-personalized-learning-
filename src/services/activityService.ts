import activitiesData from '../../content/activities.json';
import type { Activity, ActionVariant } from '../types';

export const ACTIVITIES: Activity[] = activitiesData as Activity[];

export interface VisualItemInfo {
  icon: string;
  name: string;
  color: string;
  bgLight: string;
}

export const VISUAL_ITEMS: Record<string, VisualItemInfo> = {
  apple: { icon: '🍎', name: 'Apples', color: '#EF4444', bgLight: '#FEF2F2' },
  star: { icon: '⭐', name: 'Stars', color: '#F59E0B', bgLight: '#FFFBEB' },
  bird: { icon: '🐦', name: 'Birds', color: '#3B82F6', bgLight: '#EFF6FF' },
  fish: { icon: '🐟', name: 'Fish', color: '#06B6D4', bgLight: '#ECFEFF' },
  balloon: { icon: '🎈', name: 'Balloons', color: '#EC4899', bgLight: '#FDF2F8' },
  frog: { icon: '🐸', name: 'Frogs', color: '#10B981', bgLight: '#ECFDF5' },
  bee: { icon: '🐝', name: 'Bees', color: '#EAB308', bgLight: '#FEFCE8' },
  cookie: { icon: '🍪', name: 'Cookies', color: '#D97706', bgLight: '#FFFBEB' },
  puppy: { icon: '🐶', name: 'Puppies', color: '#8B5CF6', bgLight: '#F5F3FF' },
  sun: { icon: '☀️', name: 'Suns', color: '#F59E0B', bgLight: '#FFFBEB' },
  shoe: { icon: '👟', name: 'Shoes', color: '#EF4444', bgLight: '#FEF2F2' },
  kitten: { icon: '🐱', name: 'Kittens', color: '#6366F1', bgLight: '#EEF2FF' }
};

export function getVisualItemInfo(activity: Activity): VisualItemInfo {
  const text = (activity.title + ' ' + activity.description).toLowerCase();
  for (const [key, info] of Object.entries(VISUAL_ITEMS)) {
    if (text.includes(key)) {
      return info;
    }
  }
  return { icon: '🔵', name: 'Items', color: '#3CC172', bgLight: '#ECFDF5' };
}

export function getAllActivities(): Activity[] {
  return ACTIVITIES;
}

export function getActivityById(id: string): Activity | undefined {
  return ACTIVITIES.find(a => a.activity_id === id);
}

export function filterActivities(
  query: string,
  difficulty: 'all' | 'easy' | 'medium' = 'all',
  presentation: 'all' | 'visual' | 'text' = 'all',
  allowedVariants?: ActionVariant[]
): Activity[] {
  const cleanQuery = query.trim().toLowerCase();

  return ACTIVITIES.filter(act => {
    // Text search
    if (cleanQuery) {
      const matchTitle = act.title.toLowerCase().includes(cleanQuery);
      const matchDesc = act.description.toLowerCase().includes(cleanQuery);
      const matchPrompt = act.prompt_text.toLowerCase().includes(cleanQuery);
      const matchVariant = act.variant_code.toLowerCase().includes(cleanQuery);
      if (!matchTitle && !matchDesc && !matchPrompt && !matchVariant) {
        return false;
      }
    }

    // Difficulty filter
    if (difficulty !== 'all' && act.difficulty !== difficulty) {
      return false;
    }

    // Presentation filter
    if (presentation !== 'all' && act.presentation !== presentation) {
      return false;
    }

    // Allowed variants filter
    if (allowedVariants && !allowedVariants.includes(act.variant_code)) {
      return false;
    }

    return true;
  });
}

export function getRandomActivityForVariant(
  variant: ActionVariant,
  excludeId?: string
): Activity {
  const matching = ACTIVITIES.filter(a => a.variant_code === variant);
  if (matching.length === 0) {
    return ACTIVITIES[0];
  }

  const eligible = excludeId ? matching.filter(a => a.activity_id !== excludeId) : matching;
  const listToSample = eligible.length > 0 ? eligible : matching;
  const randomIndex = Math.floor(Math.random() * listToSample.length);
  return listToSample[randomIndex];
}
