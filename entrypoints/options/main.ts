import { createLogger, installErrorForwarding } from '@/messaging/logger'

installErrorForwarding('options')
const log = createLogger('options')
log.info('options page opened (installer stub)')
