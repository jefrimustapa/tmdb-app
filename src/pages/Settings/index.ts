import React from 'react';

export const SettingsTV = React.lazy(() => import('./Settings.tv').then(m => ({ default: m.Settings })));
export const SettingsMobile = React.lazy(() => import('./Settings.mobile').then(m => ({ default: m.Settings })));
