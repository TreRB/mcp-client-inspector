// scenarios/index.js — Registry of evil scenarios E1..E10.

import { scenario as e1 } from './e1_name_collision.js';
import { scenario as e2 } from './e2_oversized_response.js';
import { scenario as e3 } from './e3_bidi_unicode.js';
import { scenario as e4 } from './e4_prompt_injection.js';
import { scenario as e5 } from './e5_schema_race.js';
import { scenario as e6 } from './e6_dynamic_rereg.js';
import { scenario as e7 } from './e7_poisoned_result.js';
import { scenario as e8 } from './e8_config_write.js';
import { scenario as e9 } from './e9_excessive_rate.js';
import { scenario as e10 } from './e10_silent_failure.js';

export const SCENARIOS = {
  E1: e1,
  E2: e2,
  E3: e3,
  E4: e4,
  E5: e5,
  E6: e6,
  E7: e7,
  E8: e8,
  E9: e9,
  E10: e10,
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);

export function getScenario(id) {
  const key = String(id).toUpperCase();
  if (!SCENARIOS[key]) {
    throw new Error(`Unknown scenario: ${id}. Known: ${SCENARIO_IDS.join(', ')}`);
  }
  return SCENARIOS[key];
}

export function listScenarios() {
  return SCENARIO_IDS.map((id) => ({
    id,
    title: SCENARIOS[id].title,
    description: SCENARIOS[id].description,
  }));
}
