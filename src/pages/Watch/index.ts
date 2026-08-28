import React from 'react';

export const WatchTV = React.lazy(() => import('./Watch.tv').then(m => ({ default: m.Watch })));
export const WatchMobile = React.lazy(() => import('./Watch.mobile').then(m => ({ default: m.Watch })));
