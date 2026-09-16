import React from 'react';
import { Home as HomeTVComponent } from './Home.tv';

export const HomeTV = HomeTVComponent;
export const HomeMobile = React.lazy(() => import('./Home.mobile').then(m => ({ default: m.Home })));

