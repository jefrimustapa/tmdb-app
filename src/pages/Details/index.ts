import React from 'react';

export const DetailsTV = React.lazy(() => import('./Details.tv').then(m => ({ default: m.Details })));
export const DetailsMobile = React.lazy(() => import('./Details.mobile').then(m => ({ default: m.Details })));
