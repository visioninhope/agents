'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getAllGraphsAction } from '@/lib/actions/graph-full';
import { Combobox } from '@/components/ui/combobox';
import { FilterTriggerComponent } from './filter-trigger';
import type { OptionType } from '@/components/ui/combobox';

interface GraphFilterProps {
  onSelect: (value: string | undefined) => void;
  selectedValue: string | undefined;
}

export const GraphFilter = ({ onSelect, selectedValue }: GraphFilterProps) => {
  const { tenantId, projectId } = useParams() as { tenantId: string; projectId: string };
  const [graphOptions, setGraphOptions] = useState<OptionType[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const fetchGraphs = async () => {
      try {
        setLoading(true);
        const response = await getAllGraphsAction(tenantId, projectId);
        if (!cancelled && response.success) {
          setGraphOptions(
            response.data?.map((graph) => ({
              value: graph.id,
              label: graph.name,
              searchBy: graph.name,
            })) || []
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch graphs:', error);
          setGraphOptions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGraphs();
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId]);
  return (
    <Combobox
      defaultValue={selectedValue}
      notFoundMessage={'No graphs found'}
      onSelect={(value) => {
        onSelect(value);
      }}
      options={graphOptions}
      TriggerComponent={
        <FilterTriggerComponent
          disabled={loading}
          filterLabel={'Graph'}
          isRemovable={true}
          onDeleteFilter={() => {
            onSelect(undefined);
          }}
          multipleCheckboxValues={selectedValue ? [selectedValue] : []}
          options={graphOptions}
        />
      }
    />
  );
};
