import express from 'express';
import { initDb } from '../db/db';

const app = express();
const port = 3000;

// Initialize database
const db = initDb();

//Middleware to parse the JSON bodies
app.use(express.json());

// Add/Create a User
app.post('/users', (req, res) => {
  // TODO: Implement API to add a new user
  // This endpoint allows the creation of a new user by receiving 'id' and 'name' in the request body.
  const { id, name } = req.body;

  // Check if id and name are present
  if (!id || !name) {
    return res.status(400).json({ error: 'ID and name are required' });
  }

  // Insert the user into the database
  db.run("INSERT INTO user (id, name) VALUES (?, ?)", [id, name], (err) => {
    if (err) {
      // Handle any errors during insertion
      return res.status(500).json({ error: 'Failed to add user', details: err.message });
    }
    // Respond with success message
    res.status(201).json({ message: 'User added successfully' });
  });
});

// TODO: Implement API to add a new user

// Create a Post
app.post('/posts', (req, res) => {
  // TODO: Implement API to create a new post
  // This endpoint creates a new post linked to a user by receiving 'id', 'user_id', and 'content' in the request body.
  const { id, user_id, content } = req.body;

  // Check if required fields are present
  if (!id || !user_id || !content) {
    return res.status(400).json({ error: 'ID, user_id, and content are required' });
  }

  // Generate the current timestamp for post creation
  const createdAt = new Date().toISOString();

  // Insert the post into the database
  db.run(
    "INSERT INTO post (id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
    [id, user_id, content, createdAt],
    (err) => {
      if (err) {
        // Handle any errors during insertion
        return res.status(500).json({ error: 'Failed to create post', details: err.message });
      }
      // Respond with success message
      res.status(201).json({ message: 'Post created successfully' });
    }
  );
});

// Create a Comment
app.post('/comments', (req, res) => {
  // TODO: Implement API to create a new comment
  // This endpoint allows a user to comment on a post by receiving 'id', 'post_id', 'user_id', and 'content' in the request body.
  const { id, post_id, user_id, content } = req.body;

  // Check if required fields are present
  if (!id || !post_id || !user_id || !content) {
    return res.status(400).json({ error: 'ID, post_id, user_id, and content are required' });
  }

  // Generate the current timestamp for comment creation
  const createdAt = new Date().toISOString();
  // Insert the comment into the database
  db.run(
    "INSERT INTO comment (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, post_id, user_id, content, createdAt],
    (err) => {
      if (err) {
        // Handle any errors during insertion
        return res.status(500).json({ error: 'Failed to create comment', details: err.message });
      }
      // Respond with success message
      res.status(201).json({ message: 'Comment created successfully' });
    }
  );
});


// Get Feed (Sorted list of posts)
app.get('/feed', (req, res) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Fetch user interactions (keywords from posts and comments)
  const userInteractionsQuery = `
    SELECT DISTINCT p.content AS post_content
    FROM post p
    LEFT JOIN comment c ON p.id = c.post_id
    WHERE p.user_id = ? OR c.user_id = ?
  `;

  // Fetch posts and rank them based on similarity, recency, and engagement
  const feedQuery = `
    SELECT 
      p.*, 
      (COALESCE(c.comments_count, 0)) AS comments_count,
      (julianday('now') - julianday(p.created_at)) AS recency_score,
      CASE 
        WHEN p.content LIKE ? THEN 1 ELSE 0 
      END AS similarity_score
    FROM post p
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comments_count 
      FROM comment 
      GROUP BY post_id
    ) c ON p.id = c.post_id
    ORDER BY similarity_score DESC, comments_count DESC, recency_score ASC;
  `;

  // Execute user interactions query first
  db.all(userInteractionsQuery, [user_id, user_id], (err, userInteractions: { post_content: string }[]) => {
    if (err) {
      console.error('Error fetching user interactions:', err.message);
      return res.status(500).json({ error: 'Failed to fetch user interactions', details: err.message });
    }

    // Extract and process keywords from user interactions
    const userKeywords = userInteractions.map((row) => row.post_content).join(' ');

    // Simulates keyword weighting based on frequency
    const keywordWeightMap: { [key: string]: number } = {}; // Define a map with string keys and number values

    const keywordsArray: string[] = userKeywords ? userKeywords.split(' ') : [];

    // Build the keyword weight map
    keywordsArray.forEach((word) => {
      if (word.trim()) { // Ensure the word is not empty
        keywordWeightMap[word] = (keywordWeightMap[word] || 0) + 1;
      }
    });

    // Enhance the feed query with machine-learning inspired scoring
    db.all(feedQuery, [`%${userKeywords}%`], (err, feed: { content: string; comments_count: number; recency_score: number; score?: number }[]) => {
      if (err) {
        console.error('Error fetching feed:', err.message);
        return res.status(500).json({ error: 'Failed to fetch feed', details: err.message });
      }

      // Score posts based on keyword frequency and recency/engagement
      const scoredFeed = feed.map((post) => {
        let score = 0;

        // Adjust score based on keyword frequency in the post content
        const postContentWords = post.content.split(' ');
        postContentWords.forEach((word) => {
          if (keywordWeightMap[word]) {
            score += keywordWeightMap[word];
          }
        });

        // Prioritize posts with higher engagement (comments)
        score += post.comments_count * 2; // Give more weight to comments

        // Prioritize newer posts (recent posts get a higher score)
        const recencyFactor = 1 / (1 + post.recency_score); // Lower recency_score => Higher score
        score *= recencyFactor;

        return {
          ...post,
          score,
        };
      });

      // Step 6: Sort posts based on the computed score
      scoredFeed.sort((a, b) => b.score! - a.score!); // Sort by score (descending)

      res.status(200).json({ feed: scoredFeed });
    });
  });
});



// Get a Post and Its Comments
app.get('/posts/:id', (req, res) => {
  // TODO: Implement API to get a post and its comments
  // This endpoint retrieves a specific post by its 'id' and fetches all associated comments.
  const { id } = req.params;

  // Fetch the post by id
  db.get("SELECT * FROM post WHERE id = ?", [id], (err, post) => {
    if (err) {
      // Handle any errors during fetching post
      return res.status(500).json({ error: 'Failed to fetch post', details: err.message });
    }
    if (!post) {
      // If the post is not found, return a 404 error
      return res.status(404).json({ error: 'Post not found' });
    }

    // Fetch comments related to this post
    db.all("SELECT * FROM comment WHERE post_id = ?", [id], (err, comments) => {
      if (err) {
        // Handle any errors during fetching comments
        return res.status(500).json({ error: 'Failed to fetch comments', details: err.message });
      }
      // Respond with the post and its comments
      res.status(200).json({ post, comments });
    });
  });
});

//Start the server on the specified port
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
