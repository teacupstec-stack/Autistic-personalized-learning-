import type { PictureSymbol } from '../types';

export const CORE_SYMBOLS: PictureSymbol[] = [
  {
    id: 'symbol_help',
    intent: 'Help',
    label: 'Help',
    description: 'Ask for assistance or guidance',
    iconName: 'HelpCircle',
    colorTheme: {
      bg: '#FEF3C7', // Amber-100
      border: '#D97706', // Amber-600
      text: '#92400E', // Amber-800
      accent: '#F59E0B', // Amber-500
      hoverBg: '#FDE68A',
    },
    keyboardShortcut: '1',
  },
  {
    id: 'symbol_break',
    intent: 'Break',
    label: 'Break',
    description: 'Need a rest, pause, or calm moment',
    iconName: 'Coffee',
    colorTheme: {
      bg: '#E0F2FE', // Sky-100
      border: '#0284C7', // Sky-600
      text: '#075985', // Sky-800
      accent: '#38BDF8', // Sky-400
      hoverBg: '#BAE6FD',
    },
    keyboardShortcut: '2',
  },
  {
    id: 'symbol_finished',
    intent: 'Finished',
    label: 'Finished',
    description: 'Task completed or ready to stop',
    iconName: 'CheckCircle2',
    colorTheme: {
      bg: '#DCFCE7', // Emerald-100
      border: '#16A34A', // Emerald-600
      text: '#166534', // Emerald-800
      accent: '#22C55E', // Emerald-500
      hoverBg: '#BBF7D0',
    },
    keyboardShortcut: '3',
  },
  {
    id: 'symbol_yes',
    intent: 'Yes',
    label: 'Yes',
    description: 'Affirmative, agree, or confirm',
    iconName: 'ThumbsUp',
    colorTheme: {
      bg: '#F0FDF4', // Green-50
      border: '#059669', // Emerald-600
      text: '#065F46', // Emerald-800
      accent: '#10B981', // Emerald-500
      hoverBg: '#D1FAE5',
    },
    keyboardShortcut: '4',
  },
  {
    id: 'symbol_no',
    intent: 'No',
    label: 'No',
    description: 'Decline, disagree, or stop',
    iconName: 'ThumbsDown',
    colorTheme: {
      bg: '#FFE4E6', // Rose-100
      border: '#E11D48', // Rose-600
      text: '#9F1239', // Rose-800
      accent: '#F43F5E', // Rose-500
      hoverBg: '#FECDD3',
    },
    keyboardShortcut: '5',
  },
];
