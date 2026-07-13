import { createRouter } from '../../src/index';

const router = createRouter('admin');

exports.main = (event: unknown, context: unknown) => router.handle(event as never, context);
