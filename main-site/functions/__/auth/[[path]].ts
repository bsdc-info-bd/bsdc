import { proxyFirebaseAuth } from '../../_firebase-auth';

export const onRequest: PagesFunction = ({ request }) => proxyFirebaseAuth(request);
