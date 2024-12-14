import express from 'express';
import { initDb } from '../db/db';

const app = express();
const port = 3000;

// Initialize database connection and instance
const db = initDb();

// Middleware to parse JSON request bodies
app.use(express.json());

// Utility functions to modularize database interactions and input validation

// This function ensures that required fields are present in the incoming data
// Simple form of input validation to reduce errors and ensure data consistency
const validateUserInput = (data: { [key: string]: any }, requiredFields: string[]): string | null => {
  for (const field of requiredFields) {
    if (!data[field]) {
      return `${field} is required`;
    }
  }
  return null;
};

// Main validation and sanitization function
const validateAndSanitize = (
  data: { [key: string]: any }, // Input data from user
  requiredFields: { [field: string]: 'string' | 'number' | 'boolean' } // Expected fields and their types
): { error: string | null; sanitizedData: { [key: string]: any } } => {
  const sanitizedData: { [key: string]: any } = {}; // Object to hold sanitized values

  // Iterate through each required field and its expected type
  for (const [field, type] of Object.entries(requiredFields)) {
    const value = data[field]; // Get the user input for the current field

    // Check if the field is missing
    if (value === undefined || value === null) {
      return { error: `${field} is required`, sanitizedData: {} }; // Return an error if the field is missing
    }

    // Type validation for each field
    if (type === 'string' && typeof value !== 'string') {
      return { error: `${field} must be a string`, sanitizedData: {} }; // Check if the value is a string
    }
    if (type === 'number' && !Number.isFinite(value)) {
      return { error: `${field} must be a valid number`, sanitizedData: {} }; // Check if the value is a valid finite number
    }
    if (type === 'boolean' && typeof value !== 'boolean') {
      return { error: `${field} must be a boolean`, sanitizedData: {} }; // Check if the value is a boolean
    }

    // If the field type is a string, it can be further processed
    if (type === 'string') {
      sanitizedData[field] = sanitizeInput(value); // Assign the sanitized string value
    } else {
      sanitizedData[field] = value; // For number and boolean types, assign the value directly
    }
  }

  return { error: null, sanitizedData }; // Return sanitized data with no errors
};

// Run a query and return a promise for handling asynchronous operations
// Wrapping the db.run method in a promise allows for easy integration with async/await syntax
const runQuery = async (query: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err: Error | null) {
      if (err) return reject(err);
      resolve(this);
    });
  });
};

// Fetch multiple rows from the database based on the query
// Using a promise abstraction ensures that async operations are handled correctly with async/await
const fetchQuery = async (query: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

// Fetch a single row from the database based on the query
// This function uses the `get` method from SQLite and wraps it in a promise for easier handling
const fetchSingleQuery = async (query: string, params: any[] = []): Promise<any | null> => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err: Error | null, row: any) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

// Helper function to sanitize input strings
const sanitizeInput = (input: string): string => {
  return input.trim(); // Trimming the input to remove leading and trailing whitespace
};

// Add/Create a User
app.post('/users', async (req, res) => {
  try {
    // Validate user input before processing
    const validationResult = validateAndSanitize(req.body, { id: 'string', name: 'string' });
    if (validationResult.error) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { id, name } = validationResult.sanitizedData; // Use sanitized data

    // Insert user into the database
    await runQuery("INSERT INTO user (id, name) VALUES (?, ?)", [id, name]);
    res.status(201).json({ message: 'User added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add user', details: (err as Error).message });
  }
});

// Create a Post
app.post('/posts', async (req, res) => {
  try {
    // Validate input data before processing the creation of a post
    const validationResult = validateAndSanitize(req.body, { id: 'string', user_id: 'string', content: 'string' });
    if (validationResult.error) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { id, user_id, content } = validationResult.sanitizedData; // Use sanitized data

    // Check if the user exists before creating the post
    const userExists = await fetchSingleQuery("SELECT id FROM user WHERE id = ?", [user_id]);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const createdAt = new Date().toISOString();
    await runQuery(
      "INSERT INTO post (id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
      [id, user_id, content, createdAt]
    );

    res.status(201).json({ message: 'Post created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post', details: (err as Error).message });
  }
});

// Create a Comment
app.post('/comments', async (req, res) => {
  try {
    // Validate input data for creating a comment
    const validationResult = validateAndSanitize(req.body, { id: 'string', post_id: 'string', user_id: 'string', content: 'string' });
    if (validationResult.error) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { id, post_id, user_id, content } = validationResult.sanitizedData; // Use sanitized data
    const createdAt = new Date().toISOString();

    // Insert the comment into the database
    await runQuery(
      "INSERT INTO comment (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, post_id, user_id, content, createdAt]
    );

    res.status(201).json({ message: 'Comment created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create comment', details: (err as Error).message });
  }
});

// Cache object to temporarily store the feed data
// Using a Map for in-memory caching to efficiently and temporarily store data that can be reused
const feedCache = new Map();

// Get Feed
app.get('/feed', async (req, res) => {
  try {
    const { user_id, batch_size = 20, start_after_id = 0 } = req.query;

    // Ensure that user_id is provided, otherwise return a bad request error
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Cache key is dynamically created based on user_id and batch details to prevent unnecessary recalculations
    const cacheKey = `${user_id}-${start_after_id}-${batch_size}`;

    // Check if the feed is already cached for the given parameters (cache hit)
    if (feedCache.has(cacheKey)) {
      console.log('Cache hit for feed');
      return res.status(200).json(feedCache.get(cacheKey));
    }

    // Cache miss: Log and continue with database fetching
    console.log('Cache miss for feed');

    // Query to fetch user interactions and preferences to customize the feed content
    const userInteractionsQuery = `
      SELECT DISTINCT p.content AS post_content
      FROM post p
      LEFT JOIN comment c ON p.id = c.post_id
      WHERE p.user_id = ? OR c.user_id = ?
    `;
    // Explanation: 
    // This query fetches unique post content based on the user's interactions (posts and comments).
    // The goal is to identify posts relevant to the user by considering both the posts they have made 
    // and the comments they have interacted with.

    // Query to fetch the feed data with improved ranking based on recency, comments, and relevance to the user
    const feedQuery = `
      SELECT 
        p.*, 
        COALESCE(c.comments_count, 0) AS comments_count,
        (julianday('now') - julianday(p.created_at)) AS recency_score,
        CASE 
          WHEN p.content LIKE ? THEN 1.5  -- Relevance score based on user interactions
          ELSE 1 
        END AS relevance_score
      FROM post p
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS comments_count 
        FROM comment 
        GROUP BY post_id
      ) c ON p.id = c.post_id
      WHERE p.content LIKE ? AND p.id > ?
      ORDER BY (comments_count * 1.2 + recency_score * 0.8 + relevance_score) DESC
      LIMIT ?;
    `;
    // Explanation: 
    // This query retrieves posts for the feed, calculating a custom ranking based on:
    // 1. `comments_count`: The number of comments associated with a post (weighted 1.2).
    // 2. `recency_score`: The freshness of the post (weighted 0.8).
    // 3. `relevance_score`: Whether the post content is relevant to the user, based on their previous interactions (weighted 1).
    // The posts are ordered by these factors to provide a dynamic and personalized feed for the user.

    // Fetch user interaction data to understand preferences and derive relevant keywords
    const userInteractions = await fetchQuery(userInteractionsQuery, [user_id, user_id]);
    const userKeywords = userInteractions.map((row) => row.post_content).join(' ');

    // Fetch the feed data with dynamic ranking, influenced by user preferences
    const feed = await fetchQuery(feedQuery, [`%${userKeywords}%`, `%${userKeywords}%`, start_after_id, batch_size]);

    // If no results are found, indicate that all batches have been fetched
    if (feed.length === 0) {
      const response = { feed, done: true };
      feedCache.set(cacheKey, response); // Cache the empty result to avoid redundant database calls
      return res.status(200).json(response);
    }

    // Get the last post ID to facilitate batching for the next batch
    const lastPostId = feed[feed.length - 1].id;

    // Structure the response with the current batch and the ID for the next batch
    const response = { feed, start_after_id: lastPostId };

    // Cache the response to optimize future feed requests
    feedCache.set(cacheKey, response);

    // Return the feed data along with the next batch ID
    res.status(200).json(response);

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feed', details: (err as Error).message });
  }
});

// Get a Post and Its Comments
app.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the post by ID
    const post = await fetchSingleQuery("SELECT * FROM post WHERE id = ?", [id]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Fetch all comments related to the post
    const comments = await fetchQuery("SELECT * FROM comment WHERE post_id = ?", [id]);
    res.status(200).json({ post, comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post and comments', details: (err as Error).message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
