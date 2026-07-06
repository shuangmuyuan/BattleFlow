'use client';

import { type Toolkit } from '@assistant-ui/react';
import { Citation } from '@/components/tool-ui/citation';
import { safeParseSerializableCitation } from '@/components/tool-ui/citation/schema';

export const toolkit: Toolkit = {
  showCitation: {
    type: 'backend',
    render: ({ result }) => {
      const parsed = safeParseSerializableCitation(result);
      if (!parsed) {
        return null;
      }
      return <Citation {...parsed} />;
    },
  },
};
