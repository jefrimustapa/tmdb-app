import React from 'react';

export const HomeTV = React.lazy(() => import('./Home.tv').then(m => ({ default: m.Home })));
export const HomeMobile = React.lazy(() => import('./Home.mobile').then(m => ({ default: m.Home })));
