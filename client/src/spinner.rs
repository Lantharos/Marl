use std::io::{self, IsTerminal, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

pub fn run<T, F>(message: impl Into<String>, f: F) -> T
where
    F: FnOnce() -> T,
{
    if !io::stderr().is_terminal() {
        return f();
    }

    let message = message.into();
    let done = Arc::new(AtomicBool::new(false));
    let spinner_done = Arc::clone(&done);
    let handle = thread::spawn(move || {
        let frames = ["/", "\\"];
        let mut index = 0usize;
        while !spinner_done.load(Ordering::Relaxed) {
            let _ = write!(
                io::stderr(),
                "\r{} {}",
                frames[index % frames.len()],
                message
            );
            let _ = io::stderr().flush();
            index = index.wrapping_add(1);
            thread::sleep(Duration::from_millis(90));
        }
        let clear = " ".repeat(message.len() + 3);
        let _ = write!(io::stderr(), "\r{clear}\r");
        let _ = io::stderr().flush();
    });

    let result = f();
    done.store(true, Ordering::Relaxed);
    let _ = handle.join();
    result
}
