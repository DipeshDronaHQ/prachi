const { Subject, Question } = require('../models');

const seedData = async () => {
  try {
    // Check if data already exists
    const existingSubjects = await Subject.countDocuments();
    if (existingSubjects > 0) {
      console.log('Seed data already exists, skipping...');
      return;
    }

    console.log('Seeding database with initial data...');

    // Create subjects
    const subjects = await Subject.create([
      {
        name: 'Mathematics',
        description: 'Mathematical concepts, algebra, calculus, and problem solving'
      },
      {
        name: 'Physics',
        description: 'Physics principles, mechanics, thermodynamics, and quantum theory'
      },
      {
        name: 'Chemistry',
        description: 'Chemical reactions, organic chemistry, and molecular structures'
      },
      {
        name: 'Computer Science',
        description: 'Programming, algorithms, data structures, and software engineering'
      },
      {
        name: 'Biology',
        description: 'Life sciences, genetics, ecology, and human anatomy'
      }
    ]);

    // Create sample questions for each subject
    const questions = [];
    
    // Mathematics questions
    const mathSubject = subjects.find(s => s.name === 'Mathematics');
    questions.push(
      {
        subjectId: mathSubject._id,
        title: 'Quadratic Equation',
        difficulty: 'medium',
        content: 'Solve: x² + 5x + 6 = 0'
      },
      {
        subjectId: mathSubject._id,
        title: 'Calculus Derivative',
        difficulty: 'hard',
        content: 'Find the derivative of f(x) = x³ + 2x² - 5x + 1'
      },
      {
        subjectId: mathSubject._id,
        title: 'Basic Algebra',
        difficulty: 'easy',
        content: 'Solve for x: 2x + 8 = 20'
      }
    );

    // Physics questions
    const physicsSubject = subjects.find(s => s.name === 'Physics');
    questions.push(
      {
        subjectId: physicsSubject._id,
        title: 'Newton\'s Laws',
        difficulty: 'medium',
        content: 'A 10kg object accelerates at 5 m/s². What is the force applied?'
      },
      {
        subjectId: physicsSubject._id,
        title: 'Wave Motion',
        difficulty: 'hard',
        content: 'Calculate the frequency of a wave with wavelength 2m and speed 340 m/s'
      }
    );

    // Computer Science questions
    const csSubject = subjects.find(s => s.name === 'Computer Science');
    questions.push(
      {
        subjectId: csSubject._id,
        title: 'Binary Search',
        difficulty: 'medium',
        content: 'Implement binary search algorithm with O(log n) complexity'
      },
      {
        subjectId: csSubject._id,
        title: 'Array Sorting',
        difficulty: 'easy',
        content: 'Sort the array [64, 34, 25, 12, 22, 11, 90] using bubble sort'
      }
    );

    await Question.create(questions);

    console.log(`Seeded ${subjects.length} subjects and ${questions.length} questions`);
    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

module.exports = seedData;