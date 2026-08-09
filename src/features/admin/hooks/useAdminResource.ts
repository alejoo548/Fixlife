import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

export const useAdminResource = <T,>(url: string, pick: (payload: any) => T, initial: T) => {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(pick(await adminApi.get(url))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos.'); }
    finally { setLoading(false); }
  }, [url, pick]);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, loading, error, reload };
};
