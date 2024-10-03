import * as sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import './providers/openai'
import './models/openai'

import { init, config } from './configurator'
import { system, user } from './types/message'
import { simple } from './lmp/simple'
import { complex } from './lmp/complex'

export { init, config, system, user, simple, complex }
