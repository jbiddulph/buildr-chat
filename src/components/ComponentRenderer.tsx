/**
 * Component Renderer
 * 
 * Renders a component based on its config.
 * This is where you map component types to actual React components.
 */

import React from "react";
import { ComponentConfig } from "@/lib/appConfig";

type ComponentRendererProps = {
  config: ComponentConfig;
  appId?: string;
};

// Map component types to actual components
const componentMap: Record<string, React.ComponentType<any>> = {
  // Add your component mappings here
  // Example: Map: MapComponent,
  // Example: List: ListComponent,
};

export default function ComponentRenderer({
  config,
  appId,
}: ComponentRendererProps) {
  const { type, props = {}, ...rest } = config;

  // Get the component from the map, or use a default
  const Component = componentMap[type] || DefaultComponent;

  return (
    <div className="component" data-component-type={type}>
      <Component {...props} {...rest} appId={appId} />
    </div>
  );
}

/**
 * Default component fallback when component type is not found
 */
function DefaultComponent({ type, ...props }: any) {
  return (
    <div className="component-placeholder">
      <p className="text-sm text-gray-500">
        Component type "{type}" not found
      </p>
      <pre className="text-xs mt-2 bg-gray-100 p-2 rounded overflow-auto">
        {JSON.stringify(props, null, 2)}
      </pre>
    </div>
  );
}


