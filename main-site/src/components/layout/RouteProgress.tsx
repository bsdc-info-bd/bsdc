import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from 'react-router-dom';

/** Thin top progress bar during lazy route transitions. */
export function RouteProgress() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const active = navigation.state !== 'idle';
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!active) {
      setWidth(0);
      return;
    }
    setWidth(25);
    const timer = window.setInterval(() => {
      setWidth((value) => (value >= 90 ? 90 : value + 15));
    }, 180);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="bsdc-route-progress"
      style={{ width: `${width}%` }}
      role="progressbar"
      aria-label={t('a11y.routeLoading')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
    />
  );
}
