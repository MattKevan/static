// src/core/services/renderer/render.service.ts

import Handlebars from 'handlebars';
import type { LocalSiteData, PageResolutionResult, LayoutManifest } from '@/core/types';
import { PageType } from '@/core/types';
import { getAssetContent, getLayoutManifest } from '@/core/services/config/configHelpers.service';
import { getActiveImageService } from '@/core/services/images/images.service';
import { getMergedThemeDataForForm } from '@/core/services/config/theme.service';
import { prepareRenderEnvironment } from './asset.service';
import { assemblePageContext, assembleBaseContext } from './context.service';

/**
 * Defines the options passed to the main render function.
 */
export interface RenderOptions {
    siteRootPath: string;
    isExport: boolean;
    relativeAssetPath?: string;
}

/**
 * Determines the correct Handlebars template path for the body content.
 */
function getBodyTemplatePath(resolution: PageResolutionResult, pageLayoutManifest: LayoutManifest | null): string {

    if (resolution.type === PageType.NotFound) return 'index.hbs'; // Fallback
    
    // --- FIX: This logic was flawed. It was trying to read collection options for a single page. ---
    // It should check if the current page is a collection page or a collection *item*.
    const isCollectionPage = !!resolution.contentFile.frontmatter.collection;

    if (isCollectionPage) {
        // This is a collection list page (e.g., /blog)
        const collectionOptions = resolution.contentFile.frontmatter.collection || {};
        const choiceKey = (collectionOptions.listingStyle as string) || pageLayoutManifest?.display_options?.listingStyle?.default;
        const template = choiceKey ? pageLayoutManifest?.display_options?.listingStyle.options[choiceKey]?.template : 'index.hbs';
        return template || 'index.hbs';
    } else {
        // This is a single page or a collection item page (e.g., /blog/my-post).
        // For collection items, the layout choice comes from the *parent* collection's config.
        // This logic is complex for the renderer; for now, we assume a single item template per layout.
        // A more robust solution might involve looking up the parent config, but this is a safe default.
        return pageLayoutManifest?.files.find(f => f.path.includes('item.hbs'))?.path || 'index.hbs';
    }
}

/**
 * Renders a resolved page into a full HTML string. This is the primary
 * orchestration function for the entire rendering pipeline.
 */
export async function render(
    siteData: LocalSiteData,
    resolution: PageResolutionResult,
    options: RenderOptions
): Promise<string> {
    if (resolution.type === PageType.NotFound) {
        return `<h1>404 - Not Found</h1><p>${resolution.errorMessage}</p>`;
    }

    // 1. Synchronize Data and Prepare Environment
    const { initialConfig: finalMergedConfig } = await getMergedThemeDataForForm(siteData.manifest.theme.name, siteData.manifest.theme.config);
    const synchronizedSiteData = { ...siteData, manifest: { ...siteData.manifest, theme: { ...siteData.manifest.theme, config: finalMergedConfig }}};
    await prepareRenderEnvironment(synchronizedSiteData);

    // 2. Get Services and Manifests
    const imageService = getActiveImageService(synchronizedSiteData.manifest);
    const pageLayoutManifest = await getLayoutManifest(synchronizedSiteData, resolution.layoutPath);

    // 3. Assemble Contexts
    const pageContext = await assemblePageContext(synchronizedSiteData, resolution, options, imageService, pageLayoutManifest);
    const baseContext = await assembleBaseContext(synchronizedSiteData, resolution, options, imageService, pageContext);

    // 4. Compile and Render Body
    const bodyTemplatePath = getBodyTemplatePath(resolution, pageLayoutManifest);
    const bodyTemplateSource = await getAssetContent(synchronizedSiteData, 'layout', resolution.layoutPath, bodyTemplatePath);
    if (!bodyTemplateSource) throw new Error(`Body template not found: layouts/${resolution.layoutPath}/${bodyTemplatePath}`);
    
    // --- FIX #1: AWAIT the template execution to resolve async helpers inside the body. ---
    const bodyHtml = await Handlebars.compile(bodyTemplateSource)(pageContext);

    // 5. Compile and Render Final Page Shell
    const baseTemplateSource = await getAssetContent(synchronizedSiteData, 'theme', synchronizedSiteData.manifest.theme.name, 'base.hbs');
    if (!baseTemplateSource) throw new Error('Base theme template (base.hbs) not found.');
    
    // Inject the rendered body HTML into the base context
    const finalContextWithBody = { ...baseContext, body: new Handlebars.SafeString(bodyHtml) };

    // --- FIX #2: AWAIT the final template execution to resolve async helpers in the shell (header, footer, etc.). ---
    return await Handlebars.compile(baseTemplateSource)(finalContextWithBody);
}