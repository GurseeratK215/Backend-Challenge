import sqlite3 from 'sqlite3';

export function initDb() {
  const db = new sqlite3.Database('mydb.sqlite');

  db.serialize(() => {

    // Create user table
    db.run("CREATE TABLE IF NOT EXISTS user (id INT, name TEXT)");

    // Add seed data to user table
    const stmt = db.prepare("INSERT INTO user (id, name) VALUES (?, ?)");
    for (let i = 0; i < 10; i++) {
      stmt.run(i, `User${i}`);
    }
    stmt.finalize();

    // TODO: Implement the rest of the database setup and seed data

    // Create post table with index for user_id and created_at
    db.run("CREATE TABLE IF NOT EXISTS post (id INT PRIMARY KEY, user_id INT, content TEXT, created_at TEXT, FOREIGN KEY (user_id) REFERENCES user (id))");
    db.run("CREATE INDEX IF NOT EXISTS idx_post_user_created_at ON post(user_id, created_at)");

    // Add seed data to post table
    const postStmt = db.prepare("INSERT INTO post (id, user_id, content, created_at) VALUES (?, ?, ?, ?)");
    for (let i = 0; i < 5; i++) {
      postStmt.run(i, i % 10, `Post content ${i}`, new Date().toISOString());
    }
    postStmt.finalize();

    // Create comment table with index for post_id and user_id
    db.run("CREATE TABLE IF NOT EXISTS comment (id INT PRIMARY KEY, post_id INT, user_id INT, content TEXT, created_at TEXT, FOREIGN KEY (post_id) REFERENCES post (id), FOREIGN KEY (user_id) REFERENCES user (id))");
    db.run("CREATE INDEX IF NOT EXISTS idx_comment_post_user ON comment(post_id, user_id)");

    // Add seed data to comment table
    const commentStmt = db.prepare("INSERT INTO comment (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)");
    for (let i = 0; i < 10; i++) {
      commentStmt.run(i, i % 5, i % 10, `Comment content ${i}`, new Date().toISOString());
    }
    commentStmt.finalize();
  });

  // Optionally, export db for other modules to use
  return db;
}
