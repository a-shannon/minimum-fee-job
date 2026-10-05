import { renderToStaticMarkup } from 'react-dom/server';

import Home from '../../src/app/page';

/**
 * Renders Home on the server with its original JSX expression and current environment.
 */
export const renderHome = () => renderToStaticMarkup(<Home />);
