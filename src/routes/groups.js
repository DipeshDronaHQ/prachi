const express = require('express');
const { StudyGroup, GroupGoal, GroupMemberActivity, User } = require('../models');
const authenticate = require('../middleware/auth');
const {
  validateCreateGroup,
  validateAddMember,
  validateCreateGoal,
  validateRecordActivity,
  validateObjectId,
  validateLeaderboardQuery
} = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /api/groups - List user's groups
router.get('/', async (req, res) => {
  try {
    const groups = await StudyGroup.find({
      members: req.user._id,
      isActive: true
    })
    .populate('creator', 'name email avatar')
    .populate('members', 'name email avatar')
    .sort({ updatedAt: -1 });

    res.json({
      success: true,
      message: 'Groups retrieved successfully',
      data: {
        groups: groups.map(group => ({
          id: group._id,
          name: group.name,
          description: group.description,
          creator: group.creator,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          isCreator: group.creator._id.toString() === req.user._id.toString(),
          createdAt: group.createdAt,
          updatedAt: group.updatedAt
        }))
      }
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve groups',
      error: {
        code: 'GET_GROUPS_ERROR'
      },
      data: null
    });
  }
});

// POST /api/groups - Create study group
router.post('/', validateCreateGroup, async (req, res) => {
  try {
    const { name, description, members } = req.body;

    // Check if user already has an active group as creator (business rule)
    const existingGroup = await StudyGroup.findOne({
      creator: req.user._id,
      isActive: true
    });

    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'You can only create one active group at a time',
        error: {
          code: 'ACTIVE_GROUP_EXISTS'
        },
        data: null
      });
    }

    // Validate member emails if provided
    let memberIds = [];
    if (members && members.length > 0) {
      const memberUsers = await User.find({ email: { $in: members } });
      memberIds = memberUsers.map(user => user._id);
      
      if (memberUsers.length !== members.length) {
        const foundEmails = memberUsers.map(user => user.email);
        const notFound = members.filter(email => !foundEmails.includes(email));
        return res.status(400).json({
          success: false,
          message: 'Some member emails not found',
          error: {
            code: 'MEMBERS_NOT_FOUND',
            details: `Not found: ${notFound.join(', ')}`
          },
          data: null
        });
      }
    }

    const group = await StudyGroup.create({
      name,
      description,
      creator: req.user._id,
      members: [req.user._id, ...memberIds]
    });

    const populatedGroup = await StudyGroup.findById(group._id)
      .populate('creator', 'name email avatar')
      .populate('members', 'name email avatar');

    res.status(201).json({
      success: true,
      message: 'Study group created successfully',
      data: {
        groupId: group._id,
        name: group.name,
        description: group.description,
        creator: populatedGroup.creator,
        members: populatedGroup.members,
        memberCount: populatedGroup.members.length,
        maxMembers: group.maxMembers,
        createdAt: group.createdAt
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create group',
      error: {
        code: 'CREATE_GROUP_ERROR',
        details: error.message
      },
      data: null
    });
  }
});

// GET /api/groups/:id - Get group details
router.get('/:id', validateObjectId('id'), async (req, res) => {
  try {
    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    })
    .populate('creator', 'name email avatar')
    .populate('members', 'name email avatar');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    // Get active goal
    const activeGoal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    }).populate('subjects', 'name');

    res.json({
      success: true,
      message: 'Group details retrieved successfully',
      data: {
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
          creator: group.creator,
          members: group.members,
          memberCount: group.members.length,
          maxMembers: group.maxMembers,
          isCreator: group.creator._id.toString() === req.user._id.toString(),
          activeGoal: activeGoal ? {
            id: activeGoal._id,
            title: activeGoal.title,
            description: activeGoal.description,
            subjects: activeGoal.subjects,
            targetMetric: activeGoal.targetMetric,
            deadline: activeGoal.deadline,
            progress: activeGoal.progress
          } : null,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve group details',
      error: {
        code: 'GET_GROUP_ERROR'
      },
      data: null
    });
  }
});

// POST /api/groups/:id/members - Add member to group
router.post('/:id/members', validateObjectId('id'), validateAddMember, async (req, res) => {
  try {
    const { email } = req.body;

    const group = await StudyGroup.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only group creator can add members',
        error: {
          code: 'PERMISSION_DENIED'
        },
        data: null
      });
    }

    // Check if group is full
    if (group.members.length >= group.maxMembers) {
      return res.status(400).json({
        success: false,
        message: 'Group is full',
        error: {
          code: 'GROUP_FULL'
        },
        data: null
      });
    }

    // Find user by email
    const newMember = await User.findOne({ email });
    if (!newMember) {
      return res.status(404).json({
        success: false,
        message: 'User not found with provided email',
        error: {
          code: 'USER_NOT_FOUND'
        },
        data: null
      });
    }

    // Check if user is already a member
    if (group.members.includes(newMember._id)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this group',
        error: {
          code: 'ALREADY_MEMBER'
        },
        data: null
      });
    }

    // Add member to group
    group.members.push(newMember._id);
    await group.save();

    const updatedGroup = await StudyGroup.findById(group._id)
      .populate('members', 'name email avatar');

    res.json({
      success: true,
      message: 'Member added successfully',
      data: {
        members: updatedGroup.members
      }
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add member',
      error: {
        code: 'ADD_MEMBER_ERROR'
      },
      data: null
    });
  }
});

// POST /api/groups/:id/goals - Create goal for group
router.post('/:id/goals', validateObjectId('id'), validateCreateGoal, async (req, res) => {
  try {
    const { title, description, subjects, targetMetric, deadline, recurringPattern } = req.body;

    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only group creator can create goals',
        error: {
          code: 'PERMISSION_DENIED'
        },
        data: null
      });
    }

    // Check if group already has an active goal
    const existingGoal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    });

    if (existingGoal) {
      return res.status(400).json({
        success: false,
        message: 'Group already has an active goal',
        error: {
          code: 'ACTIVE_GOAL_EXISTS'
        },
        data: null
      });
    }

    const goalData = {
      groupId: group._id,
      title,
      description,
      subjects,
      targetMetric,
      isActive: true
    };

    if (deadline) {
      goalData.deadline = deadline;
    } else if (recurringPattern) {
      goalData.recurringPattern = recurringPattern;
    }

    const goal = await GroupGoal.create(goalData);
    
    const populatedGoal = await GroupGoal.findById(goal._id)
      .populate('subjects', 'name description');

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: {
        goal: {
          id: goal._id,
          title: goal.title,
          description: goal.description,
          subjects: populatedGoal.subjects,
          targetMetric: goal.targetMetric,
          deadline: goal.deadline,
          recurringPattern: goal.recurringPattern,
          progress: goal.progress,
          createdAt: goal.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create goal',
      error: {
        code: 'CREATE_GOAL_ERROR',
        details: error.message
      },
      data: null
    });
  }
});

// GET /api/groups/:id/goals/active - Get active goal
router.get('/:id/goals/active', validateObjectId('id'), async (req, res) => {
  try {
    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    const goal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    }).populate('subjects', 'name description');

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'No active goal found for this group',
        error: {
          code: 'NO_ACTIVE_GOAL'
        },
        data: null
      });
    }

    res.json({
      success: true,
      message: 'Active goal retrieved successfully',
      data: {
        goal: {
          id: goal._id,
          title: goal.title,
          description: goal.description,
          subjects: goal.subjects,
          targetMetric: goal.targetMetric,
          deadline: goal.deadline,
          recurringPattern: goal.recurringPattern,
          progress: goal.progress,
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get active goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve active goal',
      error: {
        code: 'GET_GOAL_ERROR'
      },
      data: null
    });
  }
});

// POST /api/groups/:id/activities - Record activity
router.post('/:id/activities', validateObjectId('id'), validateRecordActivity, async (req, res) => {
  try {
    const { questionId, status, timeSpent } = req.body;

    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    const activeGoal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    });

    if (!activeGoal) {
      return res.status(400).json({
        success: false,
        message: 'No active goal found for this group',
        error: {
          code: 'NO_ACTIVE_GOAL'
        },
        data: null
      });
    }

    // Get question details to validate subject alignment
    const { Question } = require('../models');
    const question = await Question.findById(questionId).populate('subjectId');
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
        error: {
          code: 'QUESTION_NOT_FOUND'
        },
        data: null
      });
    }

    // Check if question subject aligns with goal subjects
    const goalSubjectIds = activeGoal.subjects.map(id => id.toString());
    if (!goalSubjectIds.includes(question.subjectId._id.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Question subject does not align with goal subjects',
        error: {
          code: 'SUBJECT_MISMATCH'
        },
        data: null
      });
    }

    // Only count solved or correct activities
    if (!['solved', 'correct'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Only solved or correct activities count toward progress',
        error: {
          code: 'INVALID_STATUS'
        },
        data: null
      });
    }

    // Check for duplicate activity (user-question-goal combination)
    const existingActivity = await GroupMemberActivity.findOne({
      userId: req.user._id,
      goalId: activeGoal._id,
      questionId: questionId
    });

    if (existingActivity) {
      return res.status(400).json({
        success: false,
        message: 'Activity already recorded for this question',
        error: {
          code: 'DUPLICATE_ACTIVITY'
        },
        data: null
      });
    }

    // Create activity record
    const activity = await GroupMemberActivity.create({
      userId: req.user._id,
      groupId: group._id,
      goalId: activeGoal._id,
      questionId: questionId,
      subjectId: question.subjectId._id,
      status,
      timeSpent
    });

    // Update goal progress
    const totalActivities = await GroupMemberActivity.countDocuments({
      goalId: activeGoal._id,
      status: { $in: ['solved', 'correct'] }
    });

    const progressPercentage = Math.min(
      Math.round((totalActivities / activeGoal.targetMetric.value) * 100),
      100
    );

    activeGoal.progress = {
      total: activeGoal.targetMetric.value,
      completed: totalActivities,
      percentage: progressPercentage,
      lastUpdated: new Date()
    };

    await activeGoal.save();

    res.status(201).json({
      success: true,
      message: 'Activity recorded successfully',
      data: {
        activity: {
          id: activity._id,
          questionId: activity.questionId,
          status: activity.status,
          timeSpent: activity.timeSpent,
          createdAt: activity.createdAt
        },
        progress: activeGoal.progress
      }
    });
  } catch (error) {
    console.error('Record activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record activity',
      error: {
        code: 'RECORD_ACTIVITY_ERROR',
        details: error.message
      },
      data: null
    });
  }
});

// GET /api/groups/:id/leaderboard - Get leaderboard
router.get('/:id/leaderboard', validateObjectId('id'), validateLeaderboardQuery, async (req, res) => {
  try {
    const {
      metric = 'count',
      timeWindow = 'all-time',
      sort = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    const activeGoal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    });

    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: 'No active goal found for this group',
        error: {
          code: 'NO_ACTIVE_GOAL'
        },
        data: null
      });
    }

    // Build time filter
    let timeFilter = {};
    const now = new Date();
    
    switch (timeWindow) {
      case 'daily':
        timeFilter.createdAt = {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate())
        };
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        timeFilter.createdAt = { $gte: weekStart };
        break;
      case 'monthly':
        timeFilter.createdAt = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1)
        };
        break;
    }

    // Aggregate activities for leaderboard
    const pipeline = [
      {
        $match: {
          goalId: activeGoal._id,
          status: { $in: ['solved', 'correct'] },
          ...timeFilter
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          totalTime: { $sum: '$timeSpent' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $addFields: {
          percentage: {
            $multiply: [
              { $divide: ['$count', activeGoal.targetMetric.value] },
              100
            ]
          }
        }
      },
      {
        $project: {
          userId: '$_id',
          user: {
            id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            avatar: '$user.avatar'
          },
          count: 1,
          percentage: { $round: ['$percentage', 2] },
          totalTime: 1
        }
      }
    ];

    // Add sorting
    const sortField = metric === 'count' ? 'count' : 
                     metric === 'percentage' ? 'percentage' : 'totalTime';
    const sortDirection = sort === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [sortField]: sortDirection, 'user.name': 1 } });

    const allRankings = await GroupMemberActivity.aggregate(pipeline);

    // Find user's rank
    const userRank = allRankings.findIndex(
      ranking => ranking.userId.toString() === req.user._id.toString()
    ) + 1;

    // Paginate results
    const startIndex = (page - 1) * limit;
    const rankings = allRankings.slice(startIndex, startIndex + limit);

    // Ensure current user is included if not in top results
    let includeUser = null;
    if (userRank > 0 && userRank > limit && page === 1) {
      const userRanking = allRankings[userRank - 1];
      includeUser = { ...userRanking, rank: userRank };
    }

    // Add ranks to rankings
    const rankedResults = rankings.map((ranking, index) => ({
      ...ranking,
      rank: startIndex + index + 1
    }));

    res.json({
      success: true,
      message: 'Leaderboard retrieved successfully',
      data: {
        rankings: rankedResults,
        userRank: userRank || null,
        userRanking: includeUser,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: allRankings.length,
          pages: Math.ceil(allRankings.length / limit)
        },
        filters: {
          metric,
          timeWindow,
          sort
        }
      }
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve leaderboard',
      error: {
        code: 'GET_LEADERBOARD_ERROR'
      },
      data: null
    });
  }
});

// GET /api/groups/:id/progress - Get progress
router.get('/:id/progress', validateObjectId('id'), async (req, res) => {
  try {
    const { breakdown } = req.query;

    const group = await StudyGroup.findOne({
      _id: req.params.id,
      members: req.user._id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member',
        error: {
          code: 'GROUP_NOT_FOUND'
        },
        data: null
      });
    }

    const activeGoal = await GroupGoal.findOne({
      groupId: group._id,
      isActive: true
    });

    if (!activeGoal) {
      return res.status(404).json({
        success: false,
        message: 'No active goal found for this group',
        error: {
          code: 'NO_ACTIVE_GOAL'
        },
        data: null
      });
    }

    const progressData = {
      goal: {
        id: activeGoal._id,
        title: activeGoal.title,
        targetMetric: activeGoal.targetMetric,
        deadline: activeGoal.deadline
      },
      progress: activeGoal.progress
    };

    // Add pace analysis for deadline-based goals
    if (activeGoal.deadline) {
      const now = new Date();
      const deadline = new Date(activeGoal.deadline);
      const timeRemaining = deadline - now;
      const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
      
      progressData.paceAnalysis = {
        daysRemaining: Math.max(0, daysRemaining),
        isOverdue: timeRemaining < 0,
        timeRemaining: timeRemaining > 0 ? timeRemaining : 0
      };
    }

    // Add member breakdown if requested
    if (breakdown === 'true') {
      const memberProgress = await GroupMemberActivity.aggregate([
        {
          $match: {
            goalId: activeGoal._id,
            status: { $in: ['solved', 'correct'] }
          }
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            totalTime: { $sum: '$timeSpent' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $addFields: {
            percentage: {
              $multiply: [
                { $divide: ['$count', activeGoal.targetMetric.value] },
                100
              ]
            }
          }
        },
        {
          $project: {
            user: {
              id: '$user._id',
              name: '$user.name',
              avatar: '$user.avatar'
            },
            count: 1,
            percentage: { $round: ['$percentage', 2] },
            totalTime: 1
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      progressData.members = memberProgress;
    }

    res.json({
      success: true,
      message: 'Progress retrieved successfully',
      data: progressData
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve progress',
      error: {
        code: 'GET_PROGRESS_ERROR'
      },
      data: null
    });
  }
});

module.exports = router;