import React from 'react';

export const MoviesTV = React.lazy(() => import('./Movies.tv').then(m => ({ default: m.Movies })));
export const MoviesMobile = React.lazy(() => import('./Movies.mobile').then(m => ({ default: m.Movies })));
