import React, { Suspense } from 'react';
import { useDevice } from '../../hooks/useDevice';

interface PlatformRouteProps {
  tv: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
  mobile: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
  desktop?: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
  tablet?: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
  fallback?: React.ReactNode;
}

export const PlatformRoute: React.FC<PlatformRouteProps> = ({
  tv: TVComponent,
  mobile: MobileComponent,
  desktop: DesktopComponent,
  tablet: TabletComponent,
  fallback,
}) => {
  const { isTV, isTablet, isPhone } = useDevice();

  let ComponentToRender = MobileComponent;
  if (isTV) {
    ComponentToRender = TVComponent;
  } else if (isTablet && TabletComponent) {
    ComponentToRender = TabletComponent;
  } else if (!isPhone && !isTablet && DesktopComponent) {
    ComponentToRender = DesktopComponent;
  } else {
    ComponentToRender = MobileComponent;
  }

  return (
    <Suspense fallback={fallback || <div className="min-h-screen bg-hbo-dark" />}>
      <ComponentToRender />
    </Suspense>
  );
};
