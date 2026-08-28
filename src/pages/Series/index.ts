import React from 'react';

export const SeriesTV = React.lazy(() => import('./Series.tv').then(m => ({ default: m.Series })));
export const SeriesMobile = React.lazy(() => import('./Series.mobile').then(m => ({ default: m.Series })));
