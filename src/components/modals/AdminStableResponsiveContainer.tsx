import React from 'react';
import { ResponsiveContainer } from 'recharts';

export const StableResponsiveContainer: React.FC<React.PropsWithChildren> = ({ children }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240} debounce={150}>
    {children}
  </ResponsiveContainer>
);
