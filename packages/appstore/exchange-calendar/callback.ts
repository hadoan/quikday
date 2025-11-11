import type { AppMeta } from '@quikday/types';
import { XhrApi } from '@ewsjs/xhr';
import {
  ExchangeService,
  Folder,
  FolderSchema,
  FolderTraversal,
  FolderView,
  BasePropertySet,
  PropertySet,
  SearchFilter,
  LogicalOperator,
  WellKnownFolderName,
  WebCredentials,
  Uri,
} from 'ews-javascript-api';
import { ExchangeCalendarCallbackConfig } from './types/ExchangeCalendarCallbackConfig.js';
import { ExchangeCalendarCallbackResult } from './types/ExchangeCalendarCallbackResult.js';
import { ExchangeAuthentication } from './types/ExchangeAuthentication.js';
import { ExchangeVersion } from './types/ExchangeVersion.js';

/**
 * Test connection to Exchange server and validate credentials.
 *
 * @param config - Exchange Calendar configuration
 * @returns Result object with success status and optional error message
 */
export async function testExchangeConnection(
  config: ExchangeCalendarCallbackConfig,
): Promise<ExchangeCalendarCallbackResult> {
  const {
    url,
    username,
    password,
    authenticationMethod = ExchangeAuthentication.STANDARD,
    exchangeVersion = ExchangeVersion.Exchange2016,
    useCompression = false,
  } = config;

  // Validate required fields
  if (!url) {
    throw new Error('Exchange Calendar: server URL is required');
  }
  if (!username) {
    throw new Error('Exchange Calendar: username is required');
  }
  if (!password) {
    throw new Error('Exchange Calendar: password is required');
  }

  try {
    // Create Exchange service instance
    const service = new ExchangeService(exchangeVersion);
    service.Credentials = new WebCredentials(username, password);
    service.Url = new Uri(url);

    // Configure NTLM authentication if specified
    if (authenticationMethod === ExchangeAuthentication.NTLM) {
      const xhr = new XhrApi({
        rejectUnauthorized: false,
        gzip: useCompression,
      }).useNtlmAuthentication(username, password);
      service.XHRApi = xhr;
    }

    // Test connection by listing calendar folders
    const view = new FolderView(10);
    view.PropertySet = new PropertySet(BasePropertySet.IdOnly);
    view.PropertySet.Add(FolderSchema.DisplayName);
    view.Traversal = FolderTraversal.Deep;

    const searchFilterCollection = new SearchFilter.SearchFilterCollection(LogicalOperator.And);
    searchFilterCollection.Add(new SearchFilter.IsEqualTo(FolderSchema.FolderClass, 'IPF.Appointment'));

    await service.FindFolders(WellKnownFolderName.MsgFolderRoot, searchFilterCollection, view);

    // Connection successful
    return {
      credentials: {
        url,
        username,
        password,
        authenticationMethod,
        exchangeVersion,
        useCompression,
      },
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      credentials: {
        url,
        username,
        password,
        authenticationMethod,
        exchangeVersion,
        useCompression,
      },
      success: false,
      error: `Failed to connect to Exchange server: ${message}`,
    };
  }
}

/**
 * Handle Exchange Calendar setup callback (form submission).
 * Tests the connection and saves credentials to the database.
 *
 * @param params - Request parameters including form data and dependencies
 * @returns Object with redirect URL
 */
export async function callback(params: {
  req: any;
  meta: AppMeta;
  prisma: any;
}): Promise<{ redirectTo: string }> {
  const { req, meta, prisma } = params;

  // Extract form data from request body
  const body = req.body || {};

  const url = typeof body.url === 'string' ? body.url : undefined;
  const username = typeof body.username === 'string' ? body.username : undefined;
  const password = typeof body.password === 'string' ? body.password : undefined;
  const authenticationMethod =
    typeof body.authenticationMethod === 'number'
      ? body.authenticationMethod
      : ExchangeAuthentication.STANDARD;
  const exchangeVersion =
    typeof body.exchangeVersion === 'number' ? body.exchangeVersion : ExchangeVersion.Exchange2016;
  const useCompression = Boolean(body.useCompression ?? false);

  // Validate required fields
  if (!url) {
    const err: any = new Error('Exchange server URL is required');
    err.statusCode = 400;
    throw err;
  }
  if (!username) {
    const err: any = new Error('Username/email is required');
    err.statusCode = 400;
    throw err;
  }
  if (!password) {
    const err: any = new Error('Password is required');
    err.statusCode = 400;
    throw err;
  }

  // Resolve user ID
  let numericUserId: number | undefined;
  try {
    const sub = req?.user?.sub as string | undefined;
    const email = req?.user?.email as string | undefined;

    if (sub) {
      const user = await prisma.user.findUnique({ where: { sub } });
      if (user) numericUserId = user.id;
    } else if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) numericUserId = user.id;
    }
  } catch (error) {
    console.warn('📅 [Exchange Calendar] Failed to resolve user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  if (!numericUserId) {
    const err: any = new Error('User authentication required');
    err.statusCode = 401;
    throw err;
  }

  // Test connection
  console.log('📅 [Exchange Calendar] Testing connection...');
  const testResult = await testExchangeConnection({
    url,
    username,
    password,
    authenticationMethod,
    exchangeVersion,
    useCompression,
  });

  if (!testResult.success) {
    console.error('📅 [Exchange Calendar] Connection test failed', {
      error: testResult.error,
    });
    const err: any = new Error(testResult.error || 'Failed to connect to Exchange server');
    err.statusCode = 400;
    throw err;
  }

  console.log('📅 [Exchange Calendar] Connection successful, saving credentials...');

  // Save credentials to database
  try {
    const type = meta.slug;
    const credentials = testResult.credentials;

    await prisma.credential.create({
      data: {
        type,
        key: credentials as any,
        userId: numericUserId,
        appId: meta.slug,
        emailOrUserName: username,
        invalid: false,
      },
    });

    console.log('📅 [Exchange Calendar] Credentials saved successfully');
  } catch (error) {
    console.error('📅 [Exchange Calendar] Failed to save credentials', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const err: any = new Error('Failed to save Exchange Calendar credentials');
    err.statusCode = 500;
    throw err;
  }

  // Redirect to apps page
  const defaultWeb = process.env.WEBAPP_URL || process.env.WEBAPP_BASE_URL;
  const defaultRedirect = defaultWeb ? `${defaultWeb.replace(/\/$/, '')}/apps` : '/apps';
  const redirectTo = defaultRedirect;

  return { redirectTo };
}
