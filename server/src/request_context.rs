use std::{future::Future, rc::Rc};

use worker::{Context, D1DatabaseSession, Env, Method, Request, Response, Result, RouteContext};

pub const D1_BOOKMARK_HEADER: &str = "x-d1-bookmark";

pub type Database = D1DatabaseSession;
pub type AppRouteContext = RouteContext<AppContext>;

#[derive(Clone)]
pub struct AppContext {
    database: Rc<Database>,
    wait_context: Rc<Context>,
}

impl AppContext {
    pub fn new(req: &Request, env: &Env, wait_context: Context) -> Result<Self> {
        let database = env.d1("STY_DB")?;
        let anchor = session_anchor(req)?;
        let session = database.with_session(anchor.as_deref())?;
        Ok(Self {
            database: Rc::new(session),
            wait_context: Rc::new(wait_context),
        })
    }

    pub fn database(&self) -> &Database {
        self.database.as_ref()
    }

    pub fn database_handle(&self) -> Rc<Database> {
        Rc::clone(&self.database)
    }

    pub fn wait_until<F>(&self, future: F)
    where
        F: Future<Output = ()> + 'static,
    {
        self.wait_context.wait_until(future);
    }

    pub fn apply_bookmark(&self, response: &mut Response) -> Result<()> {
        if let Some(bookmark) = self.database.get_bookmark()? {
            response.headers_mut().set(D1_BOOKMARK_HEADER, &bookmark)?;
        }
        Ok(())
    }
}

fn session_anchor(req: &Request) -> Result<Option<String>> {
    if req.method() != Method::Get && req.method() != Method::Head {
        return Ok(Some("first-primary".to_string()));
    }
    if req.headers().get("authorization")?.is_some() {
        return Ok(Some("first-primary".to_string()));
    }
    Ok(req
        .headers()
        .get(D1_BOOKMARK_HEADER)?
        .map(|bookmark| bookmark.trim().to_string())
        .filter(|bookmark| !bookmark.is_empty()))
}
