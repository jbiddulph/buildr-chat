/**
 * Page Renderer Component
 * 
 * Renders a page based on its config.
 * No guessing - just render what's in the config.
 */

import React from "react";
import { PageConfig, ComponentConfig } from "@/lib/appConfig";
import ComponentRenderer from "./ComponentRenderer";

type PageRendererProps = {
  config: PageConfig;
  appId?: string;
};

export default function PageRenderer({ config, appId }: PageRendererProps) {
  const { slug, title, components = [], layout } = config;

  return (
    <div className="page" data-page-slug={slug}>
      {title && <h1 className="page-title">{title}</h1>}

      {/* Render components in order */}
      <div className="page-components">
        {components.map((component: ComponentConfig) => (
          <ComponentRenderer
            key={component.id || `comp-${component.type}`}
            config={component}
            appId={appId}
          />
        ))}
      </div>
    </div>
  );
}


