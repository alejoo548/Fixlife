import { SupportAdmin } from '../../../components/modals/SupportAdmin';
import { getToken } from '../../../utils/session';
export default function SupportModule(){return <div className="admin-embedded-module"><SupportAdmin token={getToken('admin')}/></div>}
